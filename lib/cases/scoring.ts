import type { Case, CaseOption, Flag, FlagKey } from "@/types/cases";

// ── The three analyst muscles ────────────────────────────────────────────────
// Each maps to one flag a decision sets. Order is the analyst's arc:
// Framing → Evidence → Judgment. These are the reveal's scorecard rows.
export const MUSCLE_LABELS: Record<FlagKey, string> = {
  framing_quality: "Framing",
  metric_validity: "Evidence",
  causal_caution: "Judgment",
};

export const MUSCLE_ORDER: FlagKey[] = [
  "framing_quality",
  "metric_validity",
  "causal_caution",
];

/** The flag each chosen option carries, keyed by the decision's flag. */
export function computeFlags(
  c: Case,
  choices: Record<string, string>,
): Partial<Record<FlagKey, Flag>> {
  const flags: Partial<Record<FlagKey, Flag>> = {};
  for (const d of c.decisions) {
    const opt = d.options.find((o) => o.id === choices[d.id]);
    if (opt) flags[d.flag] = opt.flag;
  }
  return flags;
}

/** How many of the three muscles held strong (0–3). */
export function heldCount(flags: Partial<Record<FlagKey, Flag>>): number {
  return MUSCLE_ORDER.reduce((n, k) => n + (flags[k] === "strong" ? 1 : 0), 0);
}

/** One row of the "your path vs gold path" reveal. */
export interface Divergence {
  decisionId: string;
  muscle: FlagKey;
  muscleLabel: string;
  yourOption: CaseOption;
  goldOption: CaseOption;
  matched: boolean;
  /** The option's `divergenceCost` when the path diverged; "" when it matched. */
  cost: string;
}

/**
 * The computed counterfactual: for each muscle (in arc order), the learner's
 * choice vs the gold choice, whether it held, and what a divergence cost them.
 * Decisions are matched to muscles by their `flag`, so this is case-agnostic.
 */
export function diffAgainstGold(
  c: Case,
  choices: Record<string, string>,
): Divergence[] {
  const rows: Divergence[] = [];
  for (const key of MUSCLE_ORDER) {
    const d = c.decisions.find((dd) => dd.flag === key);
    if (!d) continue;
    const yourOption = d.options.find((o) => o.id === choices[d.id]);
    const goldOption = d.options.find((o) => o.id === d.gold);
    if (!yourOption || !goldOption) continue;
    const matched = yourOption.id === d.gold;
    rows.push({
      decisionId: d.id,
      muscle: key,
      muscleLabel: MUSCLE_LABELS[key],
      yourOption,
      goldOption,
      matched,
      cost: matched ? "" : yourOption.divergenceCost,
    });
  }
  return rows;
}
