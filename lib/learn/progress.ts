// ── How lit each region of the map is ────────────────────────────────────────
//
// One number per learning region: the share of that region's milestones the
// learner has actually mastered. It drives the brightness of the constellation
// on /home/learn, which is the only place a learner sees the shape of their own
// work rather than a list of it.
//
// Mastery, not movement. `mastery_validated` means the learner explained the
// thing out loud and was judged to have it; dragging a card to another column
// means they intended to. A picture that brightened on intent would be a
// picture of optimism.

import { isRegionId } from "@/lib/learn/regions";
import { type GroupProgress } from "@/lib/learn/constellation";

export interface GoalRegion {
  id:     string;
  region: string | null;
}

export interface MilestoneMastery {
  goalId:   string;
  mastered: boolean;
}

/**
 * Fold goals and their milestones into a brightness per region.
 *
 * Rules, each of which is a judgement rather than an implementation detail:
 *
 * - A goal with no region contributes nothing. Every goal predating migration
 *   051 is in that state, and so is anything the gate could not honestly file.
 *   Counting them somewhere would put a learner's history in the wrong place,
 *   which is worse than leaving it uncounted.
 * - A region with no milestones yet is ABSENT from the result, not zero. The
 *   two render identically today, but "nothing to master" and "mastered none
 *   of it" are different facts and the caller should be free to tell them
 *   apart later.
 * - Regions are counted across all of a learner's goals together, so three
 *   small tracks in one region light it as much as one large one.
 */
export function regionProgress(
  goals:      readonly GoalRegion[],
  milestones: readonly MilestoneMastery[],
): GroupProgress {
  const regionOfGoal = new Map<string, string>();
  for (const g of goals) {
    if (isRegionId(g.region)) regionOfGoal.set(g.id, g.region);
  }

  const totals = new Map<string, { done: number; all: number }>();
  for (const m of milestones) {
    const region = regionOfGoal.get(m.goalId);
    if (!region) continue;
    const bucket = totals.get(region) ?? { done: 0, all: 0 };
    bucket.all += 1;
    if (m.mastered) bucket.done += 1;
    totals.set(region, bucket);
  }

  const out: Record<string, number> = {};
  for (const [region, { done, all }] of totals) {
    if (all === 0) continue;
    out[region] = done / all;
  }
  return out;
}

/**
 * How many pieces of in-flight work the sphere will show at once.
 *
 * A learner with twenty open goals would otherwise get twenty orbiting dots and
 * no legible picture. The most recent survive, because the point of the orbit
 * is "this is what you are on right now", not an inventory.
 */
export const MAX_ORBITS = 6;

export interface GoalSummary {
  id:          string;
  topic:       string;
  region:      string | null;
  trackStatus: string;
}

export interface InFlightGoal {
  id:     string;
  topic:  string;
  region: string;
}

/**
 * The goals a learner is currently working through, in the order given.
 *
 * Three exclusions, each deliberate:
 *
 * - No region, or one this app no longer recognises. There is no cluster to
 *   orbit, and inventing one would put their work in the wrong place.
 * - A failed track. There is nothing to work through until it is rebuilt, and
 *   showing it as in flight would quietly hide a broken build behind a
 *   pleasant animation.
 * - Fully mastered. Finished work is not in flight; it has already had its
 *   effect, which is that its region burns brighter.
 *
 * A track still building counts as in flight. The learner has committed to it,
 * and that is what the orbit is reporting.
 */
export function goalsInFlight(
  goals:      readonly GoalSummary[],
  milestones: readonly MilestoneMastery[],
): InFlightGoal[] {
  const counts = new Map<string, { done: number; all: number }>();
  for (const m of milestones) {
    const bucket = counts.get(m.goalId) ?? { done: 0, all: 0 };
    bucket.all += 1;
    if (m.mastered) bucket.done += 1;
    counts.set(m.goalId, bucket);
  }

  const out: InFlightGoal[] = [];
  for (const g of goals) {
    if (out.length >= MAX_ORBITS) break;
    if (!isRegionId(g.region)) continue;
    if (g.trackStatus === "failed") continue;

    const c = counts.get(g.id);
    if (c && c.all > 0 && c.done === c.all) continue;

    out.push({ id: g.id, topic: g.topic, region: g.region });
  }
  return out;
}
