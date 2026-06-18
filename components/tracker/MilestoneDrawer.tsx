"use client";

import { useEffect, useRef, useState } from "react";
import { X, BookOpen, Plus, Loader2, MessageCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { type Milestone, type MilestoneEntry, KANBAN_COLUMN_LABELS } from "@/types";

interface Props {
  milestone:    Milestone | null;
  topicContext?: string;
  goalId?:      string;
  onClose:      () => void;
}

const COLUMN_COLOURS: Record<string, string> = {
  backlog: "text-slate-400 bg-slate-800",
  learn:   "text-sky-400 bg-sky-900/40",
  review:  "text-amber-400 bg-amber-900/40",
  done:    "text-green-400 bg-green-900/40",
};

export default function MilestoneDrawer({ milestone, topicContext, goalId, onClose }: Props) {
  const [entries, setEntries]       = useState<MilestoneEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [draft, setDraft]           = useState("");
  const [saving, setSaving]         = useState(false);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);
  const entriesEndRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!milestone) return;
    setDraft("");
    setEntries([]);
    setLoadingEntries(true);
    fetch(`/api/tracker/milestones/${milestone.id}/entries`)
      .then(r => r.json())
      .then(d => setEntries(d.entries ?? []))
      .finally(() => setLoadingEntries(false));
  }, [milestone?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    entriesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  async function submitEntry() {
    if (!draft.trim() || !milestone || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tracker/milestones/${milestone.id}/entries`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ body: draft.trim() }),
      });
      const d = await res.json();
      if (d.entry) {
        setEntries(prev => [...prev, d.entry as MilestoneEntry]);
        setDraft("");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitEntry();
    }
  }

  // Build the Ask Hugh destination URL — includes both ID (for save) and title (for display)
  function askHref(): string {
    if (!milestone) return "#";
    const titleParam = encodeURIComponent(milestone.title);
    if (goalId) {
      return `/study/${goalId}/ask?milestoneId=${milestone.id}&milestone=${titleParam}`;
    }
    const topicParam = topicContext
      ? encodeURIComponent(`${topicContext}: ${milestone.title}`)
      : titleParam;
    return `/learn?topic=${topicParam}`;
  }

  const open = milestone !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-40 flex h-full w-full max-w-md flex-col bg-slate-900 border-l border-slate-700 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {milestone && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-700 px-6 py-5">
              <div className="flex-1 min-w-0">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold mb-2 ${COLUMN_COLOURS[milestone.kanban_column]}`}>
                  {KANBAN_COLUMN_LABELS[milestone.kanban_column]}
                </span>
                <h2 className="text-base font-semibold text-slate-100 leading-snug">
                  {milestone.title}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Summary */}
            <div className="border-b border-slate-700 px-6 py-4">
              <p className="text-sm text-slate-300 leading-relaxed">{milestone.summary}</p>
            </div>

            {/* Ask Hugh CTA */}
            <div className="border-b border-slate-700 px-6 py-4">
              <Link
                href={askHref()}
                onClick={onClose}
                className="flex items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/8 px-4 py-3 transition-all hover:border-violet-500/50 hover:bg-violet-500/12 group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                    <MessageCircle size={15} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-violet-300">Ask Hugh about this</p>
                    <p className="text-xs text-slate-500">Full chat — summarise, deep-dive, examples</p>
                  </div>
                </div>
                <ArrowRight size={15} className="shrink-0 text-violet-500 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* Diary */}
            <div className="flex flex-1 flex-col min-h-0">
              <div className="shrink-0 flex items-center gap-2 px-6 py-3 border-b border-slate-800">
                <BookOpen size={14} className="text-slate-500" />
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Learning diary
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
                {loadingEntries && (
                  <div className="flex justify-center pt-6">
                    <Loader2 size={18} className="animate-spin text-slate-500" />
                  </div>
                )}
                {!loadingEntries && entries.length === 0 && (
                  <p className="text-center text-xs text-slate-600 pt-6">
                    No entries yet — add your first thought below.
                  </p>
                )}
                {entries.map(entry => (
                  <div key={entry.id} className="rounded-lg bg-slate-800/60 px-4 py-3 space-y-1.5">
                    {entry.title && (
                      <p className="text-xs font-semibold text-violet-400">{entry.title}</p>
                    )}
                    <p className="text-xs text-slate-600">
                      {new Date(entry.created_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap pt-0.5">
                      {entry.body}
                    </p>
                  </div>
                ))}
                <div ref={entriesEndRef} />
              </div>

              <div className="shrink-0 border-t border-slate-700 px-6 py-4">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write a thought, insight, or note…"
                  rows={3}
                  className="w-full resize-none rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-600">⌘ Enter to save</span>
                  <button
                    onClick={submitEntry}
                    disabled={!draft.trim() || saving}
                    className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Add entry
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
