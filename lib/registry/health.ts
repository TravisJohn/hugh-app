// ── Feature health: joining the three stores on the registry ────────────────
//
// Given raw rows from `usage_logs`, `activity_events` and `operation_events`,
// produce one health row per feature. This is the calculation behind
// `/admin/features`, kept here rather than in the page because it has real
// branching and belongs under test (CLAUDE.md rule 7).
//
// Pure: no React, no Supabase, no `server-only`. Callers do the fetching.

import { FEATURES, type FeatureDefinition } from "./features";
import { estimateCost } from "@/lib/pricing";
import type { OperationOutcome } from "@/lib/observability/operations";

// ── Inputs ──────────────────────────────────────────────────────────────────
// Shaped as the tables are, so a caller can hand rows straight from Supabase.

export interface UsageRow {
  feature:    string;
  tokens_in:  number;
  tokens_out: number;
  tts_chars:  number;
  model:      string | null;
}

export interface ActivityRow {
  feature:    string;
  user_id:    string;
  event_date: string;
}

export interface OperationRow {
  operation: string;
  outcome:   OperationOutcome;
}

// ── Output ──────────────────────────────────────────────────────────────────

/**
 * Three states, and the middle one is why this page exists.
 *
 * `reporting`  the feature records outcomes; its health numbers mean something.
 * `blind`      the feature spends money and records nothing. NOT healthy, and
 *              not broken — invisible. It must render as its own thing, because
 *              a blank that reads as a pass is the failure mode this whole
 *              project exists to prevent (CLAUDE.md rule 5).
 * `no-spend`   the feature costs nothing and has nothing to report. Cases, Case
 *              Lab and the margin are deliberately zero-runtime-AI; showing
 *              them as gaps would manufacture work that does not exist.
 */
export type Instrumentation = "reporting" | "blind" | "no-spend";

export interface FeatureHealth {
  feature:         FeatureDefinition;
  instrumentation: Instrumentation;

  /** Outcome counts. Meaningless unless `instrumentation === "reporting"`. */
  ok:       number;
  failed:   number;
  refused:  number;
  attempts: number;

  spendUsd: number;

  /** Distinct learners, and distinct days on which anyone used it. */
  learners:   number;
  activeDays: number;
}

export interface HealthReport {
  rows: FeatureHealth[];

  /** Spending features, and how many of them can report an outcome. */
  spendingCount:     number;
  instrumentedCount: number;
  blind:             FeatureDefinition[];

  totalSpendUsd: number;

  /**
   * Spend whose `usage_logs.feature` matches no registry entry.
   *
   * Surfaced rather than dropped. The drift guard makes this impossible at
   * build time, but a historic row written by deleted code can still arrive at
   * runtime, and money that belongs to nothing must be visible as exactly that
   * — never quietly excluded from a total the operator reads as complete.
   */
  unattributedSpendUsd: number;
  unattributedFeatures: string[];
}

// ── The calculation ─────────────────────────────────────────────────────────

export function instrumentationOf(f: FeatureDefinition): Instrumentation {
  if (!f.spendsTokens)       return "no-spend";
  if (f.operations.length > 0) return "reporting";
  return "blind";
}

/**
 * Cost is summed PER ROW at that row's own model rate, never by totalling
 * tokens and applying one blended rate: Hugh's models differ by up to 20x, so
 * aggregate-then-price silently mis-states spend. See CLAUDE.md.
 */
function costOf(row: UsageRow): number {
  return estimateCost(row.tokens_in ?? 0, row.tokens_out ?? 0, row.tts_chars ?? 0, row.model);
}

export function buildHealthReport(
  usage:      readonly UsageRow[],
  activity:   readonly ActivityRow[],
  operations: readonly OperationRow[],
): HealthReport {
  // Reverse indexes, built once rather than scanned per feature.
  const featureByUsage     = new Map<string, string>();
  const featureByActivity  = new Map<string, string>();
  const featureByOperation = new Map<string, string>();

  for (const f of FEATURES) {
    for (const u of f.usageFeatures)    featureByUsage.set(u, f.id);
    for (const a of f.activityFeatures) featureByActivity.set(a, f.id);
    for (const o of f.operations)       featureByOperation.set(o, f.id);
  }

  const spend     = new Map<string, number>();
  const learners  = new Map<string, Set<string>>();
  const days      = new Map<string, Set<string>>();
  const outcomes  = new Map<string, { ok: number; failed: number; refused: number }>();

  let unattributedSpendUsd = 0;
  const unattributed = new Set<string>();

  for (const row of usage) {
    const cost = costOf(row);
    const id   = featureByUsage.get(row.feature);
    if (!id) {
      unattributedSpendUsd += cost;
      unattributed.add(row.feature);
      continue;
    }
    spend.set(id, (spend.get(id) ?? 0) + cost);
  }

  for (const row of activity) {
    const id = featureByActivity.get(row.feature);
    if (!id) continue; // An unknown surface id renders nowhere, by design.
    if (!learners.has(id)) learners.set(id, new Set());
    if (!days.has(id))     days.set(id, new Set());
    learners.get(id)!.add(row.user_id);
    days.get(id)!.add(row.event_date);
  }

  for (const row of operations) {
    const id = featureByOperation.get(row.operation);
    if (!id) continue;
    const cur = outcomes.get(id) ?? { ok: 0, failed: 0, refused: 0 };
    cur[row.outcome] += 1;
    outcomes.set(id, cur);
  }

  const rows: FeatureHealth[] = FEATURES.map(f => {
    const o = outcomes.get(f.id) ?? { ok: 0, failed: 0, refused: 0 };
    return {
      feature:         f,
      instrumentation: instrumentationOf(f),
      ok:       o.ok,
      failed:   o.failed,
      refused:  o.refused,
      attempts: o.ok + o.failed + o.refused,
      spendUsd:   spend.get(f.id) ?? 0,
      learners:   learners.get(f.id)?.size ?? 0,
      activeDays: days.get(f.id)?.size ?? 0,
    };
  });

  const spending      = FEATURES.filter(f => f.spendsTokens);
  const blind         = spending.filter(f => instrumentationOf(f) === "blind");
  const totalSpendUsd = rows.reduce((s, r) => s + r.spendUsd, 0) + unattributedSpendUsd;

  return {
    rows,
    spendingCount:     spending.length,
    instrumentedCount: spending.length - blind.length,
    blind,
    totalSpendUsd,
    unattributedSpendUsd,
    unattributedFeatures: [...unattributed].sort(),
  };
}

/** `$1.84`, or `$0.004` where rounding to cents would read as free. */
export function formatUsd(n: number): string {
  if (n === 0)    return "$0.00";
  if (n < 0.01)   return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
