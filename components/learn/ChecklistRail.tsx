"use client";

import { useEffect, useState } from "react";
import { ListChecks, Check, Circle, Loader2 } from "lucide-react";
import { type LearningPoint } from "@/types";

interface Props {
  milestoneId:    string;
  milestoneTitle: string;
}

/**
 * Persistent side-rail for the Ask page. Shows the focused milestone's
 * enumerated "things to understand". Coverage is a self-assessment: the learner
 * ticks each idea once they're confident they understand it, and the checks
 * persist on the milestone. (No AI judges coverage — that's the learner's call.)
 */
export default function ChecklistRail({ milestoneId, milestoneTitle }: Props) {
  const [points, setPoints]         = useState<LearningPoint[]>([]);
  const [coveredIds, setCoveredIds] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);

  // Load the checklist + saved check-offs on open. `loading` starts true and
  // milestoneId is fixed for this component's life, so no in-effect reset needed.
  useEffect(() => {
    let active = true;
    fetch(`/api/tracker/milestones/${milestoneId}/coverage`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        setPoints(d.learningPoints ?? []);
        setCoveredIds(d.coverage?.coveredIds ?? []);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [milestoneId]);

  function toggle(id: string) {
    const next = coveredIds.includes(id)
      ? coveredIds.filter(x => x !== id)
      : [...coveredIds, id];
    setCoveredIds(next); // optimistic
    void fetch(`/api/tracker/milestones/${milestoneId}/coverage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ coveredIds: next }),
    }).catch(() => {});
  }

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
                <li key={p.id}>
                  <button
                    onClick={() => toggle(p.id)}
                    className="group flex w-full items-start gap-2.5 text-left"
                  >
                    {done
                      ? <Check  size={15} className="mt-0.5 shrink-0 text-green-400" />
                      : <Circle size={15} className="mt-0.5 shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors" />}
                    <span className={`text-sm leading-snug transition-colors ${done ? "text-slate-300" : "text-slate-400 group-hover:text-slate-200"}`}>
                      {p.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Footer — progress + guidance */}
      {points.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 px-5 py-3">
          <span className={`text-xs font-medium ${allCovered ? "text-green-400" : "text-slate-500"}`}>
            {allCovered ? "All ideas checked off" : `${coveredIds.length} of ${points.length} checked`}
          </span>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Tick each idea once you&apos;re confident you understand it — this is your own honest progress check.
          </p>
        </div>
      )}
    </aside>
  );
}
