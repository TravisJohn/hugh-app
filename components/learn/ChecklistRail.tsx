"use client";

import { useEffect, useState } from "react";
import { ListChecks, Loader2 } from "lucide-react";
import { type LearningPoint, type PointStatus } from "@/types";
import { normalizeCoverage, countByStatus } from "@/utils/coverage";
import PointStatusControl from "./PointStatusControl";

interface Props {
  milestoneId:    string;
  milestoneTitle: string;
}

/**
 * Persistent side-rail for the Ask page. Shows the focused milestone's
 * enumerated "things to understand". Coverage is a self-assessment: for each
 * idea the learner flags whether they understand it, want to bookmark it for
 * later, or are still stuck — purely their own awareness check. (No AI judges
 * coverage, and none of this gates mastery.)
 */
export default function ChecklistRail({ milestoneId, milestoneTitle }: Props) {
  const [points, setPoints]     = useState<LearningPoint[]>([]);
  const [statuses, setStatuses] = useState<Record<string, PointStatus>>({});
  const [loading, setLoading]   = useState(true);

  // Load the checklist + saved statuses on open. `loading` starts true and
  // milestoneId is fixed for this component's life, so no in-effect reset needed.
  useEffect(() => {
    let active = true;
    fetch(`/api/tracker/milestones/${milestoneId}/coverage`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        setPoints(d.learningPoints ?? []);
        setStatuses(normalizeCoverage(d.coverage)?.statuses ?? {});
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [milestoneId]);

  function setStatus(id: string, next: PointStatus | undefined) {
    const updated = { ...statuses };
    if (next) updated[id] = next; else delete updated[id];
    setStatuses(updated); // optimistic
    void fetch(`/api/tracker/milestones/${milestoneId}/coverage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ statuses: updated }),
    }).catch(() => {});
  }

  const understood = countByStatus(statuses, "understood");
  const bookmarked = countByStatus(statuses, "bookmarked");
  const stuck      = countByStatus(statuses, "stuck");
  const allCovered = points.length > 0 && understood === points.length;

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
            {points.map(p => (
              <li key={p.id} className="flex items-start justify-between gap-2">
                <span className="flex-1 text-sm leading-snug text-slate-400">
                  {p.text}
                </span>
                <PointStatusControl
                  current={statuses[p.id]}
                  onChange={next => setStatus(p.id, next)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Footer — progress + guidance */}
      {points.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 px-5 py-3">
          <span className={`text-xs font-medium ${allCovered ? "text-green-400" : "text-slate-500"}`}>
            {allCovered
              ? "All ideas marked understood"
              : `${understood} of ${points.length} understood`}
            {bookmarked > 0 && <span className="text-amber-400"> · {bookmarked} bookmarked</span>}
            {stuck > 0 && <span className="text-red-400"> · {stuck} to revisit</span>}
          </span>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Flag each idea as understood, bookmarked for later, or still unclear — your own honest progress check.
          </p>
        </div>
      )}
    </aside>
  );
}
