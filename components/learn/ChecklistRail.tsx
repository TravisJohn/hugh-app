"use client";

import {
  forwardRef, useImperativeHandle, useCallback, useEffect, useState,
} from "react";
import { ListChecks, Check, Circle, Loader2, RotateCw } from "lucide-react";
import { type LearningPoint } from "@/types";

export interface ChecklistRailHandle {
  recompute: () => void;
}

interface Props {
  milestoneId:    string;
  milestoneTitle: string;
  /** Reads the latest chat transcript at call time (avoids stale closures). */
  getTranscript:  () => string;
}

/**
 * Persistent side-rail for the Ask page. Shows the focused milestone's
 * enumerated "things to understand" and ticks each one as the learner's
 * diary + chat covers it. Recomputes on open, on Refresh, and on Summarise
 * (driven by the parent via the imperative `recompute` handle).
 */
const ChecklistRail = forwardRef<ChecklistRailHandle, Props>(function ChecklistRail(
  { milestoneId, milestoneTitle, getTranscript }, ref
) {
  const [points, setPoints]         = useState<LearningPoint[]>([]);
  const [coveredIds, setCoveredIds] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);

  const compute = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tracker/milestones/${milestoneId}/coverage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chatText: getTranscript() }),
      });
      const d = await res.json();
      if (d.learningPoints) setPoints(d.learningPoints);
      if (d.coverage)       setCoveredIds(d.coverage.coveredIds ?? []);
    } catch {
      /* keep last known state */
    } finally {
      setLoading(false);
    }
  }, [milestoneId, getTranscript]);

  // Recompute on open (and whenever the focused milestone changes)
  useEffect(() => { void compute(); }, [compute]);

  useImperativeHandle(ref, () => ({ recompute: () => void compute() }), [compute]);

  const allCovered = points.length > 0 && coveredIds.length === points.length;

  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col border-l border-slate-800 bg-slate-900/50">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-800 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-sky-400" />
          <p className="text-sm font-semibold text-white">What to understand</p>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">{milestoneTitle}</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading && points.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-xs text-slate-500">
            <Loader2 size={12} className="animate-spin" />
            Building your checklist…
          </div>
        ) : points.length === 0 ? (
          <p className="py-3 text-xs text-slate-600">
            No checklist available for this card yet.
          </p>
        ) : (
          <ol className="space-y-3">
            {points.map(p => {
              const done = coveredIds.includes(p.id);
              return (
                <li key={p.id} className="flex items-start gap-2.5">
                  {done
                    ? <Check  size={15} className="mt-0.5 shrink-0 text-green-400" />
                    : <Circle size={15} className="mt-0.5 shrink-0 text-slate-600" />}
                  <span className={`text-sm leading-snug ${done ? "text-slate-300" : "text-slate-400"}`}>
                    {p.text}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Footer — progress + manual refresh */}
      {points.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 px-5 py-3">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${allCovered ? "text-green-400" : "text-slate-500"}`}>
              {allCovered ? "All ideas covered" : `${coveredIds.length} of ${points.length} covered`}
            </span>
            <button
              onClick={() => void compute()}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />}
              Refresh
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Ask Hugh about the open items to tick them off.
          </p>
        </div>
      )}
    </aside>
  );
});

export default ChecklistRail;
