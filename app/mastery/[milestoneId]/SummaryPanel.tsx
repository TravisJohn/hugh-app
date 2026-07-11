"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Loader2, Pencil, RotateCw, Download, Check, X, FileText, Sparkles,
} from "lucide-react";
import { summaryMarkdownComponents, downloadMarkdown } from "@/lib/tracker/summaryMarkdown";

type Busy = "idle" | "generating" | "saving" | "regenerating";

interface Props {
  milestoneId:    string;
  milestoneTitle: string;
  initialDoc:     string | null;
  initialDocAt:   string | null;
  // During the live conversation the panel is a read-only guiding reference;
  // editing / regenerating happen from the intro and recap screens.
  editable:       boolean;
  // Lifts the latest saved doc to the parent (e.g. so a fresh recap screen shows
  // the current summary). Optional — the panel is otherwise self-contained.
  onDocChange?:   (doc: string, at: string) => void;
}

// The guiding "what you learned" summary. Self-contained: it generates the doc if
// the card doesn't have one yet, and (when editable) lets the learner hand-edit or
// ask Hugh to regenerate it. All persistence goes through the milestone summary route.
export default function SummaryPanel({
  milestoneId, milestoneTitle, initialDoc, initialDocAt, editable, onDocChange,
}: Props) {
  const [doc,   setDoc]   = useState<string | null>(initialDoc);
  const [docAt, setDocAt] = useState<string | null>(initialDocAt);
  const [busy,  setBusy]  = useState<Busy>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mode,  setMode]  = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState("");

  const genRanRef = useRef(false);

  function applyDoc(nextDoc: string, at: string) {
    setDoc(nextDoc);
    setDocAt(at);
    onDocChange?.(nextDoc, at);
  }

  // Generate the summary once if the card doesn't have one yet.
  useEffect(() => {
    if (doc || genRanRef.current) return;
    genRanRef.current = true;
    void generate("generating");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(kind: "generating" | "regenerating") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/tracker/milestones/${milestoneId}/summary`, { method: "POST" });
      const d   = (await res.json().catch(() => ({}))) as { summaryDoc?: string; generatedAt?: string; error?: string };
      if (!res.ok || !d.summaryDoc) {
        setError(d.error ?? "Couldn't generate the summary.");
      } else {
        applyDoc(d.summaryDoc, d.generatedAt ?? new Date().toISOString());
      }
    } catch {
      setError("Couldn't reach the summary service.");
    }
    setBusy("idle");
  }

  async function save() {
    const next = draft.trim();
    if (!next) { setError("Summary can't be empty."); return; }
    setBusy("saving");
    setError(null);
    try {
      const res = await fetch(`/api/tracker/milestones/${milestoneId}/summary`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ summaryDoc: next }),
      });
      const d = (await res.json().catch(() => ({}))) as { summaryDoc?: string; generatedAt?: string; error?: string };
      if (!res.ok || !d.summaryDoc) {
        setError(d.error ?? "Couldn't save your changes.");
      } else {
        applyDoc(d.summaryDoc, d.generatedAt ?? new Date().toISOString());
        setMode("view");
      }
    } catch {
      setError("Couldn't reach the summary service.");
    }
    setBusy("idle");
  }

  function startEdit() {
    setDraft(doc ?? "");
    setError(null);
    setMode("edit");
  }

  const working = busy !== "idle";

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/40">
      {/* Panel header */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-widest text-slate-500">Your summary</p>
            {docAt && (
              <p className="truncate text-[11px] text-slate-600">
                Updated {new Date(docAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {editable && mode === "view" && doc && (
          <div className="flex shrink-0 items-center gap-1">
            <IconBtn title="Edit"       onClick={startEdit}                 disabled={working}><Pencil size={13} /></IconBtn>
            <IconBtn title="Regenerate" onClick={() => void generate("regenerating")} disabled={working}><RotateCw size={13} /></IconBtn>
            <IconBtn title="Download"   onClick={() => downloadMarkdown(milestoneTitle, doc)} disabled={working}><Download size={13} /></IconBtn>
          </div>
        )}
      </div>

      {/* Panel body — the ONE place allowed to scroll internally (rule-4 exception, like /notes) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {busy === "generating" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles size={22} className="animate-pulse text-violet-400" />
            <p className="text-sm text-slate-400">Hugh is pulling your notes together…</p>
          </div>
        ) : mode === "edit" ? (
          <div className="flex h-full flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy === "saving"}
              className="flex-1 min-h-0 w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs leading-relaxed text-slate-200 focus:border-violet-500/60 focus:outline-none"
              placeholder="Write your summary in Markdown…"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setMode("view"); setError(null); }}
                disabled={busy === "saving"}
                className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
              >
                <X size={12} /> Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={busy === "saving"}
                className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {busy === "saving" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
              </button>
            </div>
          </div>
        ) : doc ? (
          <>
            {busy === "regenerating" && (
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 size={12} className="animate-spin" /> Regenerating…
              </div>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={summaryMarkdownComponents}>
              {doc}
            </ReactMarkdown>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-500">{error ?? "No summary yet."}</p>
            <button
              onClick={() => void generate("generating")}
              disabled={working}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-50"
            >
              <Sparkles size={13} /> Generate summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children, title, onClick, disabled,
}: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40 transition-colors"
    >
      {children}
    </button>
  );
}
