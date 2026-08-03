import type { HeatLevel, HeatReading } from "@/lib/code/heat";

// The temperature read-out on a group cell or a pack leaf: four bars that fill
// and warm as practice accumulates, so the map answers "what do I keep coming
// back to?" and "what have I never opened?" without reading a single number.
//
// The ramp is UNIVERSAL — deliberately not the group's accent colour. Heat only
// means something if a hot cell looks hot next to every other cell; tinting it
// per group would make the levels incomparable, which is the one job this has.
// Group accent stays for identity (icon, branch lines); heat stays for state.

const RAMP: Record<HeatLevel, { bars: number; color: string; label: string }> = {
  cold:    { bars: 0, color: "#334155", label: "Not started" }, // slate-700
  cool:    { bars: 1, color: "#38bdf8", label: "Just started" }, // sky-400
  warm:    { bars: 2, color: "#fbbf24", label: "Warming up" },  // amber-400
  hot:     { bars: 3, color: "#fb923c", label: "Hot" },         // orange-400
  blazing: { bars: 4, color: "#f43f5e", label: "Blazing" },     // rose-500
};

const TOTAL_BARS = 4;

/** "today" / "yesterday" / "3 days ago" / "2 months ago" — coarse on purpose. */
function lastPractised(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return "today";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/**
 * Full sentence behind the gauge — surfaced as the native tooltip and as the
 * accessible name, so the state isn't colour-only.
 */
export function heatSummary(heat: HeatReading): string {
  const { label } = RAMP[heat.level];
  if (heat.attempts === 0) return `${label} — no reps here yet`;
  const reps = heat.attempts === 1 ? "1 rep" : `${heat.attempts} reps`;
  const when = lastPractised(heat.lastAttemptAt);
  return when ? `${label} — ${reps}, last practised ${when}` : `${label} — ${reps}`;
}

export default function HeatGauge({
  heat,
  showLabel = false,
  size = "md",
}: {
  heat: HeatReading;
  /** Render the level name next to the bars (cells yes, dense leaves no). */
  showLabel?: boolean;
  size?: "sm" | "md";
}) {
  const { bars, color, label } = RAMP[heat.level];
  const summary = heatSummary(heat);
  const barW = size === "sm" ? "w-3" : "w-4";
  const barH = size === "sm" ? "h-1" : "h-1.5";

  return (
    <span className="inline-flex items-center gap-2" title={summary}>
      <span className="flex items-center gap-0.5" role="img" aria-label={summary}>
        {Array.from({ length: TOTAL_BARS }, (_, i) => {
          const lit = i < bars;
          return (
            <span
              key={i}
              aria-hidden
              className={`${barW} ${barH} rounded-full transition-colors`}
              style={{
                backgroundColor: lit ? color : "#1e293b", // slate-800 when unlit
                // A soft bloom only at the top of the ramp, so "hot" reads as
                // hot at a glance without every cell glowing.
                boxShadow: lit && (heat.level === "hot" || heat.level === "blazing")
                  ? `0 0 6px ${color}80`
                  : undefined,
              }}
            />
          );
        })}
      </span>
      {showLabel && (
        <span
          className="text-[11px] font-medium"
          style={{ color: heat.level === "cold" ? "#64748b" : color }} // slate-500 when cold
        >
          {label}
        </span>
      )}
    </span>
  );
}
