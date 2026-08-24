import { OPERATIONS, type OperationId } from "./operations";

// ── The aggregator ──────────────────────────────────────────────────────────
//
// Turns rows out of `operation_events` into the numbers the admin panel shows.
// Pure: no Supabase, no React, no clock. The caller does the date filtering in
// SQL and hands the rows here.
//
// Architecture Rule 7 — anything with real branching belongs in a tested pure
// module, not inline in a page.

/** The columns this module needs. A superset row is fine. */
export interface OperationEventRow {
  operation:   string;
  outcome:     string;
  duration_ms: number | null;
  error_class: string | null;
}

export interface ErrorClassCount {
  errorClass: string;
  count:      number;
}

export interface OperationStats {
  id:              OperationId;
  label:           string;
  failureIsSilent: boolean;

  /** Every attempt, refusals included. */
  attempts: number;
  ok:       number;
  failed:   number;
  refused:  number;

  /**
   * failed / (ok + failed). **Refusals are excluded from the denominator.**
   *
   * This is the whole reason `outcome` has three values. A refusal is the
   * system working — a usage gate doing its job, an off-domain topic being
   * turned away. Counting refusals as attempts would mean a week of learners
   * typing off-topic requests reads as a reliability collapse, and a week of
   * heavy refusals could equally mask a real failure rate by inflating the
   * denominator. Null when nothing was attempted that could succeed or fail.
   */
  failureRate: number | null;

  p50DurationMs: number | null;
  p95DurationMs: number | null;

  /** Most frequent first. Ties broken alphabetically so the order is stable. */
  topErrorClasses: ErrorClassCount[];
}

/**
 * Nearest-rank percentile. Returns null for an empty set rather than 0,
 * because "no measurements" and "instant" are different facts.
 */
export function percentile(values: readonly number[], p: number): number | null {
  const usable = values.filter(v => typeof v === "number" && Number.isFinite(v));
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => a - b);
  const rank   = Math.ceil((p / 100) * sorted.length);
  const index  = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

/**
 * Aggregate rows into one entry per registered operation.
 *
 * Iterates the REGISTRY, never the rows. Two consequences, both deliberate:
 * an operation with no rows appears with honest zeroes rather than vanishing
 * (a missing row is a finding, not an absence), and an unknown id in the table
 * is ignored rather than inventing a column nobody can interpret.
 */
export function rollupOperations(
  rows:          readonly OperationEventRow[],
  topErrorLimit = 3,
): OperationStats[] {
  return OPERATIONS.map(op => {
    const mine = rows.filter(r => r.operation === op.id);

    const ok      = mine.filter(r => r.outcome === "ok").length;
    const failed  = mine.filter(r => r.outcome === "failed").length;
    const refused = mine.filter(r => r.outcome === "refused").length;

    const decisive = ok + failed;

    const durations = mine
      .map(r => r.duration_ms)
      .filter((d): d is number => typeof d === "number" && Number.isFinite(d));

    return {
      id:              op.id,
      label:           op.label,
      failureIsSilent: op.failureIsSilent,
      attempts:        mine.length,
      ok,
      failed,
      refused,
      failureRate:     decisive === 0 ? null : failed / decisive,
      p50DurationMs:   percentile(durations, 50),
      p95DurationMs:   percentile(durations, 95),
      topErrorClasses: countErrorClasses(mine, topErrorLimit),
    };
  });
}

function countErrorClasses(
  rows:  readonly OperationEventRow[],
  limit: number,
): ErrorClassCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.outcome !== "failed") continue;
    const key = row.error_class ?? "UnknownError";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([errorClass, count]) => ({ errorClass, count }))
    .sort((a, b) => b.count - a.count || a.errorClass.localeCompare(b.errorClass))
    .slice(0, Math.max(0, limit));
}

/**
 * The failures nobody saw.
 *
 * `topic.gate` fails open — a classifier outage returns "in domain" and the
 * request proceeds — so its failures never reach a learner and never reach a
 * support message. This is the list the panel puts at the top, because every
 * other failure already has someone complaining about it.
 */
export function silentFailures(stats: readonly OperationStats[]): OperationStats[] {
  return stats.filter(s => s.failureIsSilent && s.failed > 0);
}

export interface BuildCoverage {
  goalsCreated:   number;
  recordedBuilds: number;
  /** Goals with no recorded build. Should be zero. */
  unrecorded:     number;
  complete:       boolean;
}

/**
 * Attempts we never heard about at all.
 *
 * `after()` can be killed before it records anything, and the client beacon
 * only fires if the learner's tab is still open. When both miss, the attempt
 * is invisible — no row, no failure, nothing. The only way to see that hole is
 * from the outside: every goal created should have produced exactly one
 * `track.build` row, so any shortfall is builds that happened unobserved.
 *
 * A negative shortfall is not an error. It means goals were deleted after
 * their builds were recorded, and `complete` stays true.
 */
export function buildCoverage(goalsCreated: number, recordedBuilds: number): BuildCoverage {
  const unrecorded = goalsCreated - recordedBuilds;
  return {
    goalsCreated,
    recordedBuilds,
    unrecorded,
    complete: unrecorded <= 0,
  };
}

/** Whole-window totals, for the summary line above the table. */
export function totals(stats: readonly OperationStats[]): {
  attempts: number;
  ok:       number;
  failed:   number;
  refused:  number;
  failureRate: number | null;
} {
  const attempts = stats.reduce((n, s) => n + s.attempts, 0);
  const ok       = stats.reduce((n, s) => n + s.ok, 0);
  const failed   = stats.reduce((n, s) => n + s.failed, 0);
  const refused  = stats.reduce((n, s) => n + s.refused, 0);
  const decisive = ok + failed;

  // Recomputed from the counts, never averaged from the per-operation rates:
  // a mean of rates weights a two-attempt operation the same as a
  // thousand-attempt one.
  return { attempts, ok, failed, refused, failureRate: decisive === 0 ? null : failed / decisive };
}
