"use client";

import Link from "next/link";
import { Loader2, Info } from "lucide-react";
import CalendarHeatmap from "@/components/ui/CalendarHeatmap";
import type { FeatureUsage } from "@/lib/monitor/usage";
import type { MonitorUsageState } from "@/hooks/useMonitor";

// Your Usage — the only view here you do not fill in.
//
// Every surface records one row a day when you open it, and each gets its own
// calendar. The point is the gaps: "Case Lab opened twice in six months" is a
// fact worth being able to read, and it takes twelve months on screen to read
// it.
//
// The relative ramp, not the absolute one Skills uses: a hit count has no fixed
// scale, so it shades against your own busiest day.

/** "4 Jun 2026" — the seam and last-used dates are read, not scanned. */
function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export default function UsageView({ state }: { state: MonitorUsageState }) {
  if (state.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-600">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 p-4">

      {/* ── Left: everything, then each surface ─────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="mb-1.5 flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-300">Everything</h2>
          <span className="text-xs text-slate-600">
            last 12 months · shaded by how many surfaces you opened
          </span>
        </div>
        {/* Surfaces per day, not hits. Notes logs a hit per coaching message and
            can reach ~170 in a day, which against a relative ramp would set the
            maximum and flatten the rest of the year. Intensity lives in the
            per-surface grids below, where each day is measured against its own
            surface. */}
        <CalendarHeatmap
          days={state.combined}
          unit="surface"
          cellSize={7}
          activeVerb="Used Hugh"
          emptyLabel="Nothing recorded yet — open any surface and it appears here tomorrow."
        />

        <div className="mb-2 mt-5 flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-300">By surface</h2>
          <span className="text-xs text-slate-600">
            {state.touched} of {state.perFeature.length} opened
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {state.perFeature.map(u => <FeatureCard key={u.feature.id} usage={u} />)}
        </div>
      </section>

      {/* ── Right: the ranking, and what the data is ────────────────── */}
      <section className="flex min-h-0 w-[260px] shrink-0 flex-col overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-300">Days used</h2>
          <span className="text-xs text-slate-600">12 months</span>
        </div>

        <div className="flex flex-col gap-1">
          {state.ranked.map(u => (
            <div key={u.feature.id} className="flex items-center gap-2">
              <span className={`min-w-0 flex-1 truncate text-[11px] ${
                u.activeDays > 0 ? "text-slate-400" : "text-slate-600"
              }`}>
                {u.feature.label}
              </span>
              {/* A bar rather than only a number: the gap between the top and
                  the bottom of this list is the finding, and a column of
                  numbers hides it. */}
              <span className="h-1 w-16 shrink-0 rounded-full bg-slate-800">
                <span
                  className="block h-1 rounded-full bg-emerald-500/80"
                  style={{
                    width: `${Math.round(
                      (u.activeDays / Math.max(1, state.ranked[0]?.activeDays ?? 1)) * 100,
                    )}%`,
                  }}
                />
              </span>
              <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                {u.activeDays}
              </span>
            </div>
          ))}
        </div>

        {/* ── The seam ────────────────────────────────────────────── */}
        {/* Stated, not hidden. Days before Monitor started recording were
            reconstructed from token spend and saved attempts; days after are
            visits. They are not the same measurement, and a reader comparing
            across that line deserves to know. */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <Info size={11} /> Where this comes from
          </p>
          <p className="text-[10px] leading-relaxed text-slate-600">
            From today, opening a surface records a visit. Earlier days were
            rebuilt from what Hugh had already saved — models you ran, drills you
            attempted, cases you finished — so they count work rather than
            visits. The two are not directly comparable.
          </p>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-slate-700">
          Nothing here is filled in by you, and nothing is shared. It is a record
          of where your time on Hugh actually went.
        </p>
      </section>
    </div>
  );
}

function FeatureCard({ usage }: { usage: FeatureUsage }) {
  const { feature, days, activeDays, lastUsed } = usage;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <Link
          href={feature.route}
          className="truncate text-xs font-medium text-slate-300 transition-colors hover:text-cyan-300"
        >
          {feature.label}
        </Link>
        <span className="ml-auto shrink-0 text-[10px] text-slate-600">
          {activeDays === 0
            ? "never opened"
            : `${activeDays} day${activeDays === 1 ? "" : "s"}`}
        </span>
      </div>

      <CalendarHeatmap days={days} unit="visit" cellSize={6} caption={false} />

      <p className="mt-1.5 text-[10px] text-slate-700">
        {lastUsed ? `Last opened ${longDate(lastUsed)}` : " "}
      </p>

      {/* Per-surface, because the gaps are different sizes: Case Lab has no
          history at all, while Cloud has history only for days you used its
          assistant. One footnote for both would misdescribe one of them. */}
      {feature.seedCaveat && (
        <p className="mt-1 text-[10px] leading-relaxed text-amber-600/70">
          {feature.seedCaveat}
        </p>
      )}
    </div>
  );
}
