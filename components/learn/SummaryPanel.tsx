"use client";

import { useState } from "react";
import { X, BookMarked, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export interface SummaryData {
  story:    string;
  takeaway: string;
}

interface Props {
  topic:        string;
  data:         SummaryData | null;
  loading:      boolean;
  goalId?:      string;
  milestoneId?: string;
  onClose:      () => void;
}

export default function SummaryPanel({ topic, data, loading, goalId, milestoneId, onClose }: Props) {
  const router = useRouter();
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState("");

  async function handleSave() {
    if (!data || saving || saved) return;
    setSaving(true);
    setSaveError("");

    try {
      const res = await fetch("/api/learn/save-summary", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          topic,
          story:    data.story,
          takeaway: data.takeaway,
          milestoneId,
        }),
      });

      if (!res.ok) throw new Error();

      const result = await res.json() as { milestoneId?: string };
      setSaved(true);

      // Navigate back to the tracker and pulse the updated card
      const pulseId = result.milestoneId ?? milestoneId;
      if (goalId && pulseId) {
        setTimeout(() => router.push(`/study/${goalId}/track?pulse=${pulseId}`), 800);
      }
    } catch {
      setSaveError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-900/70 backdrop-blur-sm">

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3.5">
        <div>
          <p className="text-sm font-semibold text-white">Session Summary</p>
          <p className="text-xs text-slate-500 truncate max-w-[180px]">{topic}</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 transition-colors hover:text-slate-300"
          aria-label="Close summary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-14">
            <Loader2 size={22} className="animate-spin text-violet-400" />
            <p className="text-xs text-slate-500">Summarising your session…</p>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Narrative story */}
            <section>
              <p className="text-sm leading-relaxed text-slate-300">{data.story}</p>
            </section>

            {/* Key takeaway */}
            <section className="rounded-xl border border-violet-500/20 bg-violet-500/8 px-4 py-3.5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={13} className="shrink-0 text-violet-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
                  Key Takeaway
                </span>
              </div>
              <p className="text-sm font-medium leading-relaxed text-violet-100">
                {data.takeaway}
              </p>
            </section>
          </>
        )}
      </div>

      {/* Save footer */}
      {!loading && data && (
        <div className="shrink-0 border-t border-slate-800 px-5 py-4 space-y-2">
          {saveError && (
            <p className="text-xs text-red-400">{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
              saved
                ? "bg-green-500/15 text-green-400 cursor-default"
                : "bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {saved ? (
              <><CheckCircle2 size={15} /> Saved — returning to tracker…</>
            ) : saving ? (
              <><Loader2 size={15} className="animate-spin" /> Saving…</>
            ) : (
              <><BookMarked size={15} /> Save to Tracker</>
            )}
          </button>
          {!saved && (
            <p className="text-center text-xs text-slate-600">
              Saves this session to your learning diary
            </p>
          )}
        </div>
      )}
    </div>
  );
}
