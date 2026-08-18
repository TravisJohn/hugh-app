import { describe, it, expect } from "vitest";
import {
  MODEL_RATES,
  FALLBACK_MODEL,
  COST_PER_TTS_CHAR,
  isKnownModel,
  rateFor,
  estimateCost,
  totalCost,
} from "./pricing";

/**
 * These tests exist because the admin cost dashboard previously priced every
 * call at Sonnet rates regardless of which model ran. The regression they guard
 * is financial, not visual: a wrong rate here silently mis-reports spend.
 */
describe("rateFor", () => {
  it("returns the exact published rate for each known model", () => {
    expect(rateFor("claude-sonnet-4-6")).toEqual({ input: 3,    output: 15  });
    expect(rateFor("claude-haiku-4-5")).toEqual({  input: 1,    output: 5   });
    expect(rateFor("gpt-4o")).toEqual({            input: 2.5,  output: 10  });
    expect(rateFor("gpt-4o-mini")).toEqual({       input: 0.15, output: 0.6 });
  });

  it("falls back to the most expensive Claude rate for an unknown model, so unknown spend is never under-stated", () => {
    expect(rateFor("some-model-we-added-later")).toEqual(MODEL_RATES[FALLBACK_MODEL]);
    expect(rateFor(null)).toEqual(MODEL_RATES[FALLBACK_MODEL]);
    expect(rateFor(undefined)).toEqual(MODEL_RATES[FALLBACK_MODEL]);
  });
});

describe("isKnownModel", () => {
  it("recognises every model in the rate table", () => {
    for (const id of Object.keys(MODEL_RATES)) expect(isKnownModel(id)).toBe(true);
  });

  it("rejects absent or unrecognised models so logUsage can warn", () => {
    expect(isKnownModel(undefined)).toBe(false);
    expect(isKnownModel(null)).toBe(false);
    expect(isKnownModel("")).toBe(false);
    expect(isKnownModel("gpt-5-imaginary")).toBe(false);
  });
});

describe("estimateCost", () => {
  it("prices a Sonnet call at $3/$15 per million tokens", () => {
    // 1M in + 1M out = $3 + $15
    expect(estimateCost(1_000_000, 1_000_000, 0, "claude-sonnet-4-6")).toBeCloseTo(18, 10);
  });

  it("prices a Haiku call at a third of Sonnet — the whole point of the migration", () => {
    const haiku  = estimateCost(1_000_000, 1_000_000, 0, "claude-haiku-4-5");
    const sonnet = estimateCost(1_000_000, 1_000_000, 0, "claude-sonnet-4-6");
    expect(haiku).toBeCloseTo(6, 10);
    expect(haiku).toBeCloseTo(sonnet / 3, 10);
  });

  it("prices gpt-4o-mini far below gpt-4o", () => {
    expect(estimateCost(1_000_000, 0, 0, "gpt-4o")).toBeCloseTo(2.5, 10);
    expect(estimateCost(1_000_000, 0, 0, "gpt-4o-mini")).toBeCloseTo(0.15, 10);
  });

  it("charges TTS characters independently of the model", () => {
    expect(estimateCost(0, 0, 1_000, "claude-haiku-4-5")).toBeCloseTo(COST_PER_TTS_CHAR * 1_000, 10);
    expect(estimateCost(0, 0, 1_000)).toBeCloseTo(0.3, 10);
  });

  it("returns zero for an empty call", () => {
    expect(estimateCost(0, 0, 0, "claude-haiku-4-5")).toBe(0);
  });

  it("prices an omitted model at the fallback rate rather than throwing", () => {
    expect(estimateCost(1_000_000, 0, 0)).toBeCloseTo(3, 10);
  });
});

describe("totalCost", () => {
  it("prices each row at its own model rate instead of one blended rate", () => {
    const rows = [
      { tokens_in: 1_000_000, tokens_out: 0, model: "claude-sonnet-4-6" }, // $3.00
      { tokens_in: 1_000_000, tokens_out: 0, model: "claude-haiku-4-5"  }, // $1.00
      { tokens_in: 1_000_000, tokens_out: 0, model: "gpt-4o-mini"       }, // $0.15
    ];
    expect(totalCost(rows)).toBeCloseTo(4.15, 10);
  });

  it("differs from the old aggregate-then-price approach, which is the bug being fixed", () => {
    const rows = [
      { tokens_in: 1_000_000, tokens_out: 0, model: "claude-haiku-4-5" },
      { tokens_in: 1_000_000, tokens_out: 0, model: "claude-haiku-4-5" },
    ];
    const correct     = totalCost(rows);                          // 2 x $1.00
    const oldBlended  = estimateCost(2_000_000, 0, 0, "claude-sonnet-4-6"); // $6.00
    expect(correct).toBeCloseTo(2, 10);
    expect(oldBlended).toBeCloseTo(6, 10);
    expect(correct).toBeLessThan(oldBlended);
  });

  it("tolerates null/absent token fields on a row", () => {
    expect(totalCost([{ model: "claude-haiku-4-5" }])).toBe(0);
    expect(totalCost([{ tokens_in: null, tokens_out: null, tts_chars: null, model: null }])).toBe(0);
  });

  it("sums TTS-only rows, which carry no model", () => {
    expect(totalCost([{ tts_chars: 1_000 }, { tts_chars: 500 }])).toBeCloseTo(0.45, 10);
  });

  it("returns zero for no rows", () => {
    expect(totalCost([])).toBe(0);
  });
});
