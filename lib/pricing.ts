/**
 * Per-model token pricing.
 *
 * `usage_logs` records the model that served each call (migration 036), so cost
 * is computed per log row and summed — never by applying one blended rate to an
 * aggregate. Hugh mixes Sonnet, Haiku, and two OpenAI models whose rates differ
 * by up to 20x, so aggregate-then-price overstates the cheap routes badly.
 *
 * Pure and dependency-free so it can be unit-tested without Supabase.
 */

/** USD per 1,000,000 tokens. */
export interface ModelRate {
  input:  number;
  output: number;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  // Anthropic — see CLAUDE.md "Model Selection"
  "claude-sonnet-4-6":      { input: 3,    output: 15   },
  "claude-haiku-4-5":       { input: 1,    output: 5    },
  // OpenAI — Notes Coach (vision), Notes summariser, architecture assistant
  "gpt-4o":                 { input: 2.5,  output: 10   },
  "gpt-4o-mini":            { input: 0.15, output: 0.6  },
};

/**
 * Used when a log row has no model (rows written before migration 036) or an
 * unrecognised one. Deliberately the most expensive Claude rate: an unknown
 * model should over-estimate rather than hide spend.
 */
export const FALLBACK_MODEL = "claude-sonnet-4-6";

/** ElevenLabs, USD per character (~Creator plan). */
export const COST_PER_TTS_CHAR = 0.30 / 1_000;

export function isKnownModel(model: string | null | undefined): boolean {
  return Boolean(model && model in MODEL_RATES);
}

export function rateFor(model: string | null | undefined): ModelRate {
  if (model && model in MODEL_RATES) return MODEL_RATES[model];
  return MODEL_RATES[FALLBACK_MODEL];
}

/**
 * Cost of a single logged call. `model` is optional so TTS-only rows (which
 * have no model) and pre-036 rows still price sensibly.
 */
export function estimateCost(
  tokensIn:  number,
  tokensOut: number,
  ttsChars:  number,
  model?:    string | null,
): number {
  const rate = rateFor(model);
  return (tokensIn  * rate.input  / 1_000_000)
       + (tokensOut * rate.output / 1_000_000)
       + (ttsChars  * COST_PER_TTS_CHAR);
}

/** One row of `usage_logs`, as far as pricing is concerned. */
export interface PricedUsageRow {
  tokens_in?:  number | null;
  tokens_out?: number | null;
  tts_chars?:  number | null;
  model?:      string | null;
}

/**
 * Sum cost across many log rows, pricing each at its own model's rate.
 * This is the only correct way to total a mixed-model period.
 */
export function totalCost(rows: readonly PricedUsageRow[]): number {
  return rows.reduce(
    (sum, r) => sum + estimateCost(r.tokens_in ?? 0, r.tokens_out ?? 0, r.tts_chars ?? 0, r.model),
    0,
  );
}
