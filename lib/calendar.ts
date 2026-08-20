// ── Calendar-heatmap bucketing, shared ──────────────────────────────────────
// Three surfaces now draw the same GitHub-style calendar grid: code-drill
// practice on /code/start, per-skill sessions on /monitor, and per-surface
// activity in Monitor's Usage view. They differ only in what a "count" means,
// so the bucketing lives here once rather than being reimplemented per surface.
//
// This sits at the lib root, next to pricing.ts, rather than under lib/monitor/
// — lib/code/progress.ts consumes it, and code drills must not depend on
// Monitor. Pure: no React, no DOM, no Supabase.
//
// Day bucketing is UTC and server-computed, with no access to the learner's
// timezone: a late-night session can land on the next day's cell. That is the
// same imprecision GitHub's own contribution graph carries, and it is accepted
// rather than fixed — see docs/monitor-prd.md §7.

export interface HeatmapDay {
  /** UTC calendar date, YYYY-MM-DD. */
  date: string;
  /** How many things happened on this day. What "thing" means is the caller's. */
  count: number;
}

/** How many shades the relative ramp has, including the empty one. */
export const HEAT_LEVELS = 5;

/**
 * The top of the 1-5 effort scale. Five steps, five shades: an effort value
 * maps straight onto a shade with nothing rounded away, which is the whole
 * reason the absolute ramp exists alongside the relative one.
 */
export const EFFORT_MAX = 5;

const MS_PER_DAY = 86_400_000;

/**
 * Bucket timestamps into a fixed trailing window of daily counts, oldest first,
 * ending today (UTC).
 *
 * Accepts anything whose first ten characters are a YYYY-MM-DD date — both a
 * full ISO timestamp (`created_at`) and a bare date column (`entry_date`) — so
 * callers never have to normalise first.
 *
 * Timestamps outside the window are dropped, never clamped into the first cell:
 * a burst of activity six months ago must not masquerade as activity today.
 *
 * @param timestamps ISO timestamps or YYYY-MM-DD dates, in any order.
 * @param days       Window length. 112 (16 weeks) reads as a compact inline
 *                   grid rather than a full-year graph.
 * @param now        Injectable clock, for tests. Defaults to the real one.
 */
export function bucketByDay(
  timestamps: readonly string[],
  days = 112,
  now: Date = new Date(),
): HeatmapDay[] {
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const date = ts.slice(0, 10); // YYYY-MM-DD prefix of an ISO timestamp or a DATE
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const out: HeatmapDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(todayUTC - i * MS_PER_DAY).toISOString().slice(0, 10);
    out.push({ date, count: counts.get(date) ?? 0 });
  }
  return out;
}

/**
 * Same window, but from rows that already carry their own count — Monitor's
 * `activity_events` stores one row per surface per day with a `hits` counter,
 * so it must not be re-counted as one hit per row.
 */
export function bucketPreCounted(
  rows: readonly { date: string; count: number }[],
  days = 112,
  now: Date = new Date(),
): HeatmapDay[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const date = r.date.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + r.count);
  }

  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const out: HeatmapDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(todayUTC - i * MS_PER_DAY).toISOString().slice(0, 10);
    out.push({ date, count: counts.get(date) ?? 0 });
  }
  return out;
}

/**
 * Bucket rows that carry a value, keeping the day's PEAK rather than the sum.
 *
 * This is how Monitor shades a skill: a cell shows the hardest session that
 * day, so the grid reads as intensity. Summing would let three easy sessions
 * out-shade one hard one and would push a day past the top of the 1-5 scale,
 * where no shade exists for it.
 */
export function bucketByPeak(
  rows: readonly { date: string; value: number }[],
  days = 112,
  now: Date = new Date(),
): HeatmapDay[] {
  const peaks = new Map<string, number>();
  for (const r of rows) {
    const date = r.date.slice(0, 10);
    peaks.set(date, Math.max(peaks.get(date) ?? 0, r.value));
  }

  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const out: HeatmapDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(todayUTC - i * MS_PER_DAY).toISOString().slice(0, 10);
    out.push({ date, count: peaks.get(date) ?? 0 });
  }
  return out;
}

/**
 * Which shade of the ramp a day gets: 0 for nothing, then four quartiles of
 * that grid's own busiest day. Relative rather than absolute, so a heatmap of
 * "1-2 sessions a day" and one of "40 events a day" are both legible.
 */
export function heatLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  const ratio = count / Math.max(1, max);
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

/**
 * Which shade a 1-5 effort value gets, with no scaling at all: a 5 is always
 * the darkest shade and a 1 always the faintest, whatever the rest of the grid
 * looks like. A relative ramp would make an all-easy month look identical to an
 * all-hard one, which is exactly the comparison effort exists to make.
 *
 * Anything above the scale clamps rather than overflowing the ramp; anything at
 * or below zero is absence.
 */
export function effortLevel(effort: number): number {
  if (effort <= 0) return 0;
  return Math.min(EFFORT_MAX, Math.round(effort));
}

/** The busiest day in the window, floored at 1 so an empty grid can't divide by zero. */
export function peakCount(days: readonly HeatmapDay[]): number {
  return Math.max(1, ...days.map(d => d.count));
}

/** How many days in the window had anything at all — the "you showed up" number. */
export function activeDayCount(days: readonly HeatmapDay[]): number {
  return days.filter(d => d.count > 0).length;
}

/**
 * Pad the front of the window so the first column starts on Sunday, then split
 * into week columns. Nulls are the pad cells — rendered transparent, never as
 * an empty day, so the grid can't imply inactivity before the window began.
 */
export function toWeekColumns(days: readonly HeatmapDay[]): (HeatmapDay | null)[][] {
  if (days.length === 0) return [];
  const firstDow = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const padded: (HeatmapDay | null)[] = [...Array<null>(firstDow).fill(null), ...days];
  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}
