"use client";

import { todaysEffort, touchLabel, type SkillSummary } from "@/lib/monitor/skills";
import EffortPicker, { EFFORT_WORDS } from "./EffortPicker";

// Today, in one card: every skill, how hard you went at it, and one click to
// log it. This is the thing that has to be fast — a tracker that costs more
// than a moment gets abandoned in week three.
//
// Clicking a segment on an already-logged skill records a *second* session at
// that effort rather than editing the first. Two sittings in one day is real,
// and the cell keeps the harder of them. Removing an entry is done in the diary
// below, where you can see which one you are removing.

interface Props {
  summaries:  SkillSummary[];
  selectedId: string | null;
  busy:       boolean;
  onSelect:   (skillId: string) => void;
  onTick:     (skillId: string, effort: number) => void;
}

export default function SkillTickList({ summaries, selectedId, busy, onSelect, onTick }: Props) {
  return (
    <div className="shrink-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Today</h2>
        <span className="text-[11px] text-slate-600">click how hard it was</span>
      </div>

      <div className="flex flex-col gap-1">
        {summaries.map(s => {
          const effort = todaysEffort(s);
          return (
            <div
              key={s.skill.id}
              onClick={() => onSelect(s.skill.id)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                selectedId === s.skill.id ? "bg-slate-800/70" : "hover:bg-slate-800/40"
              }`}
            >
              <EffortPicker
                value={effort}
                busy={busy}
                subject={s.skill.name}
                onPick={n => onTick(s.skill.id, n)}
              />

              <span className={`truncate text-sm ${effort > 0 ? "text-slate-300" : "text-slate-400"}`}>
                {s.skill.name}
              </span>

              <span className="ml-auto shrink-0 text-[11px] text-slate-600">
                {effort > 0 ? EFFORT_WORDS[effort] : touchLabel(s)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
