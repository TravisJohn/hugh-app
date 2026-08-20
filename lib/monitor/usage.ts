// ── Monitor Usage — turning activity rows into calendars ────────────────────
// Pure derivation over `activity_events`. No React, no Supabase, no clock of
// its own.

import { bucketPreCounted, activeDayCount, type HeatmapDay } from "@/lib/calendar";
import { MONITOR_FEATURES, type MonitorFeature } from "./features";
import type { ActivityEvent } from "@/types/monitor";

/**
 * Twelve months, not the 182 days a skill shows.
 *
 * The point of this view is the gaps — "Case Lab opened twice in six months" is
 * the sentence it exists to let you read — and a gap needs enough either side
 * of it to be visible as one. Cells shrink to fit rather than the window
 * shrinking to the cells.
 */
export const USAGE_WINDOW_DAYS = 365;

export interface FeatureUsage {
  feature: MonitorFeature;
  days:    HeatmapDay[];
  /** Days in the window with any activity — the number the ranking sorts on. */
  activeDays: number;
  /** Total opens in the window. */
  hits: number;
  /** Most recent day with activity, or null if the window holds none. */
  lastUsed: string | null;
}

/**
 * One calendar per registered surface, in registry order.
 *
 * Driven by the REGISTRY, not by the rows. A surface with no events still gets
 * a full empty grid, because "never opened" is the most useful thing this view
 * can tell you and it cannot be told by an absent row. Conversely an event with
 * an unknown feature id renders nowhere — it is data from a surface that no
 * longer exists, and inventing a calendar for it would be worse than dropping
 * it.
 */
export function usageByFeature(
  events: readonly ActivityEvent[],
  days = USAGE_WINDOW_DAYS,
  now: Date = new Date(),
): FeatureUsage[] {
  const byFeature = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const list = byFeature.get(e.feature);
    if (list) list.push(e);
    else byFeature.set(e.feature, [e]);
  }

  return MONITOR_FEATURES.map(feature => {
    const mine = byFeature.get(feature.id) ?? [];
    const grid = bucketPreCounted(
      mine.map(e => ({ date: e.event_date, count: e.hits })), days, now,
    );

    let lastUsed: string | null = null;
    for (const d of grid) if (d.count > 0) lastUsed = d.date;

    return {
      feature,
      days: grid,
      activeDays: activeDayCount(grid),
      hits: grid.reduce((sum, d) => sum + d.count, 0),
      lastUsed,
    };
  });
}

/**
 * One combined calendar across every surface, counting **how many surfaces you
 * touched that day** — not how many times you touched them.
 *
 * Summing hits was the obvious version and it does not work. Surfaces generate
 * hits at wildly different rates: a Notes session logs a hit per coaching
 * message and can reach 174 in a day, while a day of code drills logs a
 * handful. Against a relative ramp one heavy Notes day sets the maximum and
 * flattens the rest of the year to the faintest shade — on real data, 35 of 45
 * active days collapsed to level 1. Counting surfaces is bounded (0-10),
 * comparable between days, and answers the question the grid is actually asked:
 * how much of Hugh did I use that day.
 *
 * Nothing is lost by this. Intensity still lives in the per-surface grids,
 * where every day is measured against its own surface rather than against
 * whichever surface happens to be chattiest.
 *
 * Built from the per-feature grids rather than the raw rows, so an event whose
 * feature is not in the registry is excluded here too — "Everything" and the
 * small grids must agree about what exists, or one of them is lying.
 */
export function combinedUsage(perFeature: readonly FeatureUsage[]): HeatmapDay[] {
  if (perFeature.length === 0) return [];
  return perFeature[0].days.map((day, i) => ({
    date:  day.date,
    count: perFeature.reduce((n, f) => n + (f.days[i].count > 0 ? 1 : 0), 0),
  }));
}

/**
 * Surfaces ranked by days used, busiest first.
 *
 * Ties break on the registry's own order rather than alphabetically, so a run
 * of never-opened surfaces stays in the order the rest of the view lists them
 * and the eye can find one. Surfaces with zero days are kept: a ranking that
 * dropped them would answer "what do I use" while quietly refusing to answer
 * "what do I never touch", which is the more useful half.
 */
export function rankByDaysUsed(perFeature: readonly FeatureUsage[]): FeatureUsage[] {
  return perFeature
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.activeDays - a.f.activeDays || a.i - b.i)
    .map(x => x.f);
}

/** How many of the registered surfaces have been opened at all in the window. */
export function surfacesTouched(perFeature: readonly FeatureUsage[]): number {
  return perFeature.filter(f => f.activeDays > 0).length;
}
