// ── Code drill progress — pure derivation from the attempts log ─────────────
// Two things are computed from the same `code_drill_attempts` rows:
//  1. computePackProgress — a per-pack tier for the /code/start badges.
//  2. buildHeatmap — a day-by-day attempt count for the no-streak calendar
//     heatmap.
// Both are pure functions over plain data so they're cheap to unit test and
// don't care whether the rows came from Supabase or a fixture.
//
// The day bucketing itself lives in lib/calendar.ts, shared with Monitor's
// heatmaps — one ramp, one grid, one definition of "a day". Bucketing is UTC
// and server-computed, with no access to the learner's timezone: an accepted
// simplification, the same class of imprecision GitHub's own contribution
// graph has.

import { bucketByDay, type HeatmapDay } from "@/lib/calendar";

/** One row from `code_drill_attempts`, as read from Supabase. */
export interface DrillAttemptRow {
  pack_id: string;
  cell_id: string;
  passed: boolean;
  used_ref: boolean;
  created_at: string; // ISO timestamp
}

export type PackTier = "not-started" | "in-progress" | "complete" | "owned" | "review-due";

export interface PackProgressSummary {
  packId: string;
  cellsPassed: number;
  cellsTotal: number;
  tier: PackTier;
  /** ISO timestamp of the most recent passing attempt anywhere in the pack, or null. */
  lastPassedAt: string | null;
}

/** Days of inactivity (since the pack's most recent pass) before a fully-passed
 * pack flips from complete/owned to "review due". */
export const REVIEW_DUE_DAYS = 30;

/**
 * Derive a pack's progress tier from its cell ids (the pack's own definition
 * of "done") and every attempt logged for it. Only PASSING attempts count
 * toward completion/ownership; a cell can be retried after a fail with no
 * penalty, matching the drill's own "never punishes" design.
 */
export function computePackProgress(
  packId: string,
  cellIds: string[],
  attempts: DrillAttemptRow[],
): PackProgressSummary {
  const cellsTotal = cellIds.length;
  const packAttempts = attempts.filter(a => a.pack_id === packId);

  // Latest PASSING attempt per cell — a later fail doesn't undo an earlier pass
  // (retrying and missing shouldn't erase credit already earned).
  const latestPassByCell = new Map<string, DrillAttemptRow>();
  for (const a of packAttempts) {
    if (!a.passed) continue;
    const prev = latestPassByCell.get(a.cell_id);
    if (!prev || a.created_at > prev.created_at) latestPassByCell.set(a.cell_id, a);
  }

  const cellsPassed = cellIds.filter(id => latestPassByCell.has(id)).length;

  if (cellsPassed === 0) {
    return { packId, cellsPassed: 0, cellsTotal, tier: "not-started", lastPassedAt: null };
  }

  let lastPassedAt: string | null = null;
  for (const row of latestPassByCell.values()) {
    if (!lastPassedAt || row.created_at > lastPassedAt) lastPassedAt = row.created_at;
  }

  if (cellsPassed < cellsTotal) {
    return { packId, cellsPassed, cellsTotal, tier: "in-progress", lastPassedAt };
  }

  // Every cell passed at least once — "review due" overrides complete/owned
  // when the pack's gone stale, since staleness is what the badge should
  // surface first (that's the whole "do I still have it" prompt).
  const daysSinceLastPass = lastPassedAt
    ? (Date.now() - Date.parse(lastPassedAt)) / 86_400_000
    : Infinity;
  if (daysSinceLastPass >= REVIEW_DUE_DAYS) {
    return { packId, cellsPassed, cellsTotal, tier: "review-due", lastPassedAt };
  }

  const allOwned = cellIds.every(id => latestPassByCell.get(id)?.used_ref === false);
  return { packId, cellsPassed, cellsTotal, tier: allOwned ? "owned" : "complete", lastPassedAt };
}

/** Progress for every pack, keyed by pack id. */
export function computeAllPackProgress(
  packs: { id: string; cellIds: string[] }[],
  attempts: DrillAttemptRow[],
): Record<string, PackProgressSummary> {
  const out: Record<string, PackProgressSummary> = {};
  for (const p of packs) out[p.id] = computePackProgress(p.id, p.cellIds, attempts);
  return out;
}

// Re-exported so existing importers (/code/start, CodeLanding) keep taking the
// type from here; the definition itself is shared with Monitor's heatmaps.
export type { HeatmapDay };

/**
 * A fixed trailing window of daily attempt counts, oldest first, ending today
 * (UTC) — the source for the no-streak calendar heatmap. `days` defaults to
 * 112 (16 weeks), a size that reads as a compact inline grid rather than a
 * full-year GitHub-style graph.
 *
 * A thin adapter over the shared bucketer: this function's only real job is
 * knowing that a drill attempt's day comes from `created_at`, and that every
 * attempt counts once whether it passed or failed.
 */
export function buildHeatmap(attempts: DrillAttemptRow[], days = 112): HeatmapDay[] {
  return bucketByDay(attempts.map(a => a.created_at), days);
}
