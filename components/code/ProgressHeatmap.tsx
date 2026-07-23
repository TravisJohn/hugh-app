import type { HeatmapDay } from "@/lib/code/progress";

// A compact, no-streak GitHub-style calendar heatmap: one column per week, one
// cell per day, shaded by how many checks (pass or fail) happened that day.
// Deliberately no current-streak number and no "don't break the chain" framing
// — just an honest, low-pressure record of when you showed up.

const LEVEL_STYLES = ["bg-slate-800/70", "bg-emerald-900/70", "bg-emerald-700/80", "bg-emerald-500/90", "bg-emerald-400"];

function levelOf(count: number, max: number): number {
  if (count === 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

export default function ProgressHeatmap({ days }: { days: HeatmapDay[] }) {
  if (days.length === 0) return null;

  // Pad the front so the first column starts on Sunday, matching a standard
  // week-column heatmap grid.
  const firstDow = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const padded: (HeatmapDay | null)[] = [...Array(firstDow).fill(null), ...days];
  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  const max = Math.max(1, ...days.map(d => d.count));
  const activeDays = days.filter(d => d.count > 0).length;

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                title={day ? `${day.date}: ${day.count} check${day.count === 1 ? "" : "s"}` : undefined}
                className={`h-[11px] w-[11px] shrink-0 rounded-[2px] ${
                  day ? LEVEL_STYLES[levelOf(day.count, max)] : "bg-transparent"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {activeDays === 0
          ? "No practice logged yet — your first check will show up here."
          : `Practiced on ${activeDays} of the last ${days.length} days.`}
      </p>
    </div>
  );
}
