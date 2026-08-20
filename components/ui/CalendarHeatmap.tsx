import { heatLevel, effortLevel, peakCount, activeDayCount, toWeekColumns, type HeatmapDay } from "@/lib/calendar";

/**
 * A compact, no-streak GitHub-style calendar heatmap: one column per week, one
 * cell per day, shaded by how much happened that day.
 *
 * Deliberately no current-streak number and no "don't break the chain" framing
 * — just an honest, low-pressure record of when you showed up. Monitor inherits
 * that stance wholesale: it records, it does not pressure.
 *
 * The emerald ramp is fixed and shared by every surface that draws this grid.
 * That is the rule stated in components/code/GroupCell.tsx: an accent colour
 * says *which surface you are on*, the ramp says *how much you have done*.
 * Giving Monitor its own heat colour would collapse those two meanings into
 * one, so the `unit` and `scale` props vary the wording and the number of
 * steps — never the hue.
 *
 * Two scales, one family:
 *   relative  — four quartiles of the grid's own busiest day. What a count
 *               means depends on the rest of the grid, so the ramp must too.
 *   absolute5 — a 1-5 value maps straight onto five shades. Used where the
 *               number is already a scale (Monitor's effort), so that an
 *               all-easy month and an all-hard one do not look identical.
 */

const RELATIVE_STYLES = [
  "bg-slate-800/70",
  "bg-emerald-900/70",
  "bg-emerald-700/80",
  "bg-emerald-500/90",
  "bg-emerald-400",
];

// One more step than the relative ramp, spread across the same emerald family
// so the two grids in the app still read as one system.
const ABSOLUTE5_STYLES = [
  "bg-slate-800/70",
  "bg-emerald-900/60",
  "bg-emerald-800/80",
  "bg-emerald-600/85",
  "bg-emerald-500/95",
  "bg-emerald-400",
];

export const EFFORT_SWATCHES = ABSOLUTE5_STYLES;

interface Props {
  days: HeatmapDay[];
  /**
   * What one count means here — "check" on /code/start, "session" for a
   * Monitor skill, "visit" in the Usage view. Pluralised with a bare "s".
   */
  unit?: string;
  /** Cell edge in px. Smaller when several grids are stacked in one pane. */
  cellSize?: number;
  /**
   * "relative" (default) shades against the grid's own peak. "absolute5" treats
   * each count as a 1-5 value and shades it directly.
   */
  scale?: "relative" | "absolute5";
  /** The summary line under the grid. Pass `false` where the caption is elsewhere. */
  caption?: boolean;
  /** Leads the summary line: "Practiced on 12 of the last 112 days." */
  activeVerb?: string;
  /** Shown in place of the count line when nothing has been logged at all. */
  emptyLabel?: string;
}

/** On an absolute grid the number is a rating, so it must not be read as a tally. */
function dayTitle(day: HeatmapDay, unit: string, absolute: boolean): string {
  if (absolute) {
    return day.count === 0 ? `${day.date}: nothing logged` : `${day.date}: effort ${day.count}/5`;
  }
  return `${day.date}: ${day.count} ${unit}${day.count === 1 ? "" : "s"}`;
}

export default function CalendarHeatmap({
  days,
  unit = "check",
  cellSize = 11,
  scale = "relative",
  caption = true,
  activeVerb = "Active",
  emptyLabel,
}: Props) {
  if (days.length === 0) return null;

  const weeks    = toWeekColumns(days);
  const max      = peakCount(days);
  const active   = activeDayCount(days);
  const absolute = scale === "absolute5";
  const styles   = absolute ? ABSOLUTE5_STYLES : RELATIVE_STYLES;

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                title={day ? dayTitle(day, unit, absolute) : undefined}
                style={{ width: cellSize, height: cellSize }}
                className={`shrink-0 rounded-[2px] ${
                  day
                    ? styles[absolute ? effortLevel(day.count) : heatLevel(day.count, max)]
                    : "bg-transparent"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      {caption && (
        <p className="mt-2 text-xs text-slate-500">
          {active === 0
            ? emptyLabel ?? `Nothing logged yet — your first ${unit} will show up here.`
            : `${activeVerb} on ${active} of the last ${days.length} days.`}
        </p>
      )}
    </div>
  );
}
