"use client";

import { Archive } from "lucide-react";
import CalendarHeatmap from "@/components/ui/CalendarHeatmap";
import { touchLabel, type SkillSummary } from "@/lib/monitor/skills";

// One skill: its name, how much of it there has been, and half a year of
// calendar. Selecting a row is what points the diary composer at it.

interface Props {
  summary:   SkillSummary;
  selected:  boolean;
  busy:      boolean;
  onSelect:  () => void;
  onArchive: () => void;
}

export default function SkillRow({ summary, selected, busy, onSelect, onArchive }: Props) {
  const { skill, activeDays, windowEntries } = summary;

  return (
    <div
      onClick={onSelect}
      className={`group mb-2 cursor-pointer rounded-xl border p-3 transition-colors ${
        selected
          ? "border-cyan-700/60 bg-cyan-950/20"
          : "border-slate-800 bg-slate-900/20 hover:border-slate-700"
      }`}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span className="truncate text-sm font-medium text-slate-200">{skill.name}</span>

        <span className="ml-auto shrink-0 text-xs text-slate-600">
          {windowEntries === 0
            ? "not started"
            : `${activeDays} day${activeDays === 1 ? "" : "s"} · ${windowEntries} entr${windowEntries === 1 ? "y" : "ies"}`}
        </span>

        {/* A fact on the row, not a trophy: nothing warns that it's at risk. */}
        <span className="shrink-0 rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-400">
          {touchLabel(summary)}
        </span>

        <button
          type="button"
          disabled={busy}
          onClick={e => { e.stopPropagation(); onArchive(); }}
          title="Archive this skill — its entries are kept"
          aria-label={`Archive ${skill.name}`}
          className="shrink-0 rounded p-1 text-slate-700 opacity-0 transition-opacity hover:text-slate-400 group-hover:opacity-100 disabled:cursor-not-allowed"
        >
          <Archive size={14} />
        </button>
      </div>

      {/* caption={false}: the counts already sit on the row above, and a second
          summary line under every grid would triple the row height. */}
      {/* absolute5: a cell is the day's hardest session on a 1-5 scale, so it
          shades against the scale itself rather than against this grid's own
          busiest day — a quiet month and a brutal one must not look alike. */}
      <CalendarHeatmap days={summary.days} scale="absolute5" cellSize={10} caption={false} />
    </div>
  );
}
