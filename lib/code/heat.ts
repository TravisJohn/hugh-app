// ── Practice heat — how warm a pack or group is right now ───────────────────
//
// The /code/start map tints each group cell (and each leaf) by how much it's
// been practised lately, so the landing answers two questions at a glance:
// "what do I keep coming back to?" and "what have I never touched?".
//
// Heat is DECAYED practice volume, not completion:
//
//     score = Σ 0.5 ^ (daysAgo / HEAT_HALF_LIFE_DAYS)  ÷  repCount
//
// Three deliberate choices in that formula:
//
//   1. It DECAYS. An attempt is worth half as much after 30 days, a quarter
//      after 60. A pack drilled hard in June and untouched since goes cool —
//      the map can go backwards, which is the honest signal about skill fading
//      and mirrors REVIEW_DUE_DAYS in progress.ts (same 30-day horizon).
//
//   2. Every attempt counts, pass or fail. This measures time spent, not
//      success — "I've been here a lot" is the question. Completion is already
//      covered by PackBadge / computePackProgress in progress.ts; the two are
//      complementary and shouldn't be collapsed into one number.
//
//   3. It's normalised PER REP (divided by the pack's or group's cell count).
//      Without this, Machine Learning (7 packs, ~70 reps) would outrank
//      AI & Retrieval (1 pack, 10 reps) at equal effort purely on size, and the
//      map would just be a picture of how big each group is. Normalised, a
//      score of 1.0 means "every rep in here, done once, today" — so cells and
//      leaves share one scale and can be read against each other.
//
// Pure functions over plain rows: no Supabase, no clock beyond an injected
// `now`, so the whole thing is unit-testable without mocking time.

import type { DrillAttemptRow } from "./progress";
import { CODE_GROUPS, packIdsForLang } from "./groups";
import type { DrillLang } from "@/types/code";

/** Days after which an attempt counts for half as much. */
export const HEAT_HALF_LIFE_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export type HeatLevel = "cold" | "cool" | "warm" | "hot" | "blazing";

/**
 * Lower bound of each level, in decayed-attempts-per-rep. Absolute rather than
 * relative to the learner's own maximum: a brand-new learner SHOULD see an
 * all-cold map, and "I haven't touched automation" only reads as a gap if cold
 * means cold rather than just "least practised so far".
 *
 * Calibration: one clean pass of a pack today ≈ 1.0, which lands at "hot".
 * Exported so these stay tunable once there's real usage to tune against.
 */
export const HEAT_THRESHOLDS: Record<Exclude<HeatLevel, "cold">, number> = {
  cool:    0,    // any practice at all, however faint
  warm:    0.4,  // worked through a decent slice
  hot:     1.0,  // a full pass, recently — or several, a while back
  blazing: 2.5,  // drilled repeatedly and recently
};

export interface HeatReading {
  /** Decayed attempts per rep. Unbucketed, for tooltips and sorting. */
  score: number;
  level: HeatLevel;
  /** Raw attempt count, undecayed — the "you've done N reps here" line. */
  attempts: number;
  /** ISO timestamp of the most recent attempt, or null if never practised. */
  lastAttemptAt: string | null;
}

const COLD: HeatReading = { score: 0, level: "cold", attempts: 0, lastAttemptAt: null };

/**
 * Sum of half-life-decayed weights for a set of attempt timestamps.
 *
 * Timestamps in the future (clock skew between the learner's device and the
 * server) are clamped to "now" rather than allowed to score above 1.0 each —
 * otherwise a skewed clock reads as extra practice.
 */
export function decayedCount(timestamps: string[], now: number): number {
  let total = 0;
  for (const ts of timestamps) {
    const t = Date.parse(ts);
    if (Number.isNaN(t)) continue; // unparseable row — ignore rather than poison the sum
    const daysAgo = Math.max(0, (now - t) / MS_PER_DAY);
    total += Math.pow(0.5, daysAgo / HEAT_HALF_LIFE_DAYS);
  }
  return total;
}

/** Bucket a per-rep score into a named level. */
export function heatLevel(score: number): HeatLevel {
  if (score <= 0) return "cold";
  if (score >= HEAT_THRESHOLDS.blazing) return "blazing";
  if (score >= HEAT_THRESHOLDS.hot) return "hot";
  if (score >= HEAT_THRESHOLDS.warm) return "warm";
  return "cool";
}

/**
 * Core reading: decayed attempts per rep for an arbitrary slice of attempts.
 * `repCount` is how many cells the slice covers — 0 (an empty or unknown pack)
 * yields cold rather than dividing by zero.
 */
export function readHeat(
  attempts: DrillAttemptRow[],
  repCount: number,
  now: number = Date.now(),
): HeatReading {
  if (attempts.length === 0 || repCount <= 0) return COLD;

  const score = decayedCount(attempts.map(a => a.created_at), now) / repCount;

  let lastAttemptAt: string | null = null;
  for (const a of attempts) {
    if (!lastAttemptAt || a.created_at > lastAttemptAt) lastAttemptAt = a.created_at;
  }

  return { score, level: heatLevel(score), attempts: attempts.length, lastAttemptAt };
}

/** Minimum a caller must know about a pack to compute heat for it. */
export interface PackHeatInput {
  id: string;
  lang: DrillLang;
  /** Number of cells (reps) in the pack — the normalisation denominator. */
  repCount: number;
}

/** Heat for every pack, keyed by pack id. Mirrors computeAllPackProgress. */
export function computeAllPackHeat(
  packs: PackHeatInput[],
  attempts: DrillAttemptRow[],
  now: number = Date.now(),
): Record<string, HeatReading> {
  const byPack = new Map<string, DrillAttemptRow[]>();
  for (const a of attempts) {
    const list = byPack.get(a.pack_id);
    if (list) list.push(a);
    else byPack.set(a.pack_id, [a]);
  }

  const out: Record<string, HeatReading> = {};
  for (const p of packs) out[p.id] = readHeat(byPack.get(p.id) ?? [], p.repCount, now);
  return out;
}

/**
 * Heat for every group, keyed by group id, scoped to one language.
 *
 * Language-scoped because the cell sits above the leaves the learner can
 * actually see: with the Python pill active, SQL practice must not warm the
 * "For analysis" cell whose branch shows only Python packs. Groups with no
 * packs in `lang` are omitted, matching groupsForLang.
 */
export function computeAllGroupHeat(
  packs: PackHeatInput[],
  attempts: DrillAttemptRow[],
  lang: DrillLang,
  now: number = Date.now(),
): Record<string, HeatReading> {
  const repCountOf = new Map(packs.map(p => [p.id, p.repCount]));

  const out: Record<string, HeatReading> = {};
  for (const group of CODE_GROUPS) {
    const ids = packIdsForLang(group, lang);
    if (ids.length === 0) continue;

    const idSet = new Set(ids);
    const groupAttempts = attempts.filter(a => idSet.has(a.pack_id));
    const repCount = ids.reduce((sum, id) => sum + (repCountOf.get(id) ?? 0), 0);

    out[group.id] = readHeat(groupAttempts, repCount, now);
  }
  return out;
}
