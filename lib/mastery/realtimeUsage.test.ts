import { describe, it, expect } from "vitest";
import {
  emptyTotals,
  accumulateResponse,
  accumulateTranscription,
  boundTotals,
  toUsageRows,
  isEmpty,
  MAX_TOKENS_PER_SECOND,
} from "./realtimeUsage";

describe("accumulateResponse", () => {
  it("splits a reported breakdown into the audio and text rate classes", () => {
    // The two classes price 16x apart, so putting a token in the wrong one is a
    // cost error, not a cosmetic one.
    const t = accumulateResponse(emptyTotals(), {
      input_tokens:  100,
      output_tokens: 60,
      input_token_details:  { audio_tokens: 90, text_tokens: 10 },
      output_token_details: { audio_tokens: 47, text_tokens: 13 },
    });

    expect(t.audioIn).toBe(90);
    expect(t.textIn).toBe(10);
    expect(t.audioOut).toBe(47);
    expect(t.textOut).toBe(13);
  });

  it("attributes an omitted breakdown to audio so an unknown mix cannot hide spend", () => {
    // The API does not always send token details. Guessing text would under-bill
    // by up to 16x; audio over-states, which is the direction we accept.
    const t = accumulateResponse(emptyTotals(), { input_tokens: 500, output_tokens: 200 });

    expect(t.audioIn).toBe(500);
    expect(t.audioOut).toBe(200);
    expect(t.textIn).toBe(0);
    expect(t.textOut).toBe(0);
  });

  it("assigns a remainder the breakdown does not account for to audio", () => {
    // A partial breakdown leaves real spend of unknown class. Same rule.
    const t = accumulateResponse(emptyTotals(), {
      input_tokens: 100,
      input_token_details: { audio_tokens: 60, text_tokens: 10 },
    });

    expect(t.audioIn).toBe(90); // 60 reported + 30 unaccounted
    expect(t.textIn).toBe(10);
  });

  it("accumulates across the many responses in one session", () => {
    let t = emptyTotals();
    t = accumulateResponse(t, { input_tokens: 10, output_tokens: 5 });
    t = accumulateResponse(t, { input_tokens: 20, output_tokens: 7 });

    expect(t.audioIn).toBe(30);
    expect(t.audioOut).toBe(12);
  });

  it("ignores a response that carries no usage rather than throwing", () => {
    // A missing figure must never break the learner's conversation.
    const base = emptyTotals();
    expect(accumulateResponse(base, undefined)).toEqual(base);
    expect(accumulateResponse(base, null)).toEqual(base);
    expect(accumulateResponse(base, {})).toEqual(base);
  });

  it("discards hostile or malformed counts instead of poisoning the total", () => {
    // These figures come from the browser. One NaN must not make the whole
    // session's spend unrecordable.
    const t = accumulateResponse(emptyTotals(), {
      input_tokens:  Number.NaN,
      output_tokens: -50,
      input_token_details: { audio_tokens: "9000" as unknown as number },
    });

    expect(t.audioIn).toBe(0);
    expect(t.audioOut).toBe(0);
    expect(Number.isFinite(t.audioIn)).toBe(true);
  });

  it("floors a fractional count to a whole token", () => {
    const t = accumulateResponse(emptyTotals(), { input_tokens: 10.9 });
    expect(t.audioIn).toBe(10);
  });
});

describe("accumulateTranscription", () => {
  it("records transcription separately from the coach model", () => {
    // These are different models at different rates, and the API reports them
    // through different events — they must never land in one bucket.
    let t = emptyTotals();
    t = accumulateResponse(t, { input_tokens: 100 });
    t = accumulateTranscription(t, { input_tokens: 40, output_tokens: 12 });

    expect(t.audioIn).toBe(100);
    expect(t.transcriptionIn).toBe(40);
    expect(t.transcriptionOut).toBe(12);
  });

  it("adds nothing for duration-reported usage rather than inventing tokens", () => {
    // There is no honest seconds-to-tokens conversion. A documented gap beats a
    // fabricated number in the cost record.
    const t = accumulateTranscription(emptyTotals(), { type: "duration", seconds: 30 } as never);
    expect(t.transcriptionIn).toBe(0);
    expect(t.transcriptionOut).toBe(0);
  });

  it("ignores a transcription event with no usage", () => {
    const base = emptyTotals();
    expect(accumulateTranscription(base, undefined)).toEqual(base);
  });
});

describe("boundTotals", () => {
  it("leaves a plausible session untouched", () => {
    // A real 15-minute session must never be clipped by the tamper guard.
    const totals = { ...emptyTotals(), audioIn: 15_000, audioOut: 12_000, textIn: 400 };
    const { bounded, clamped } = boundTotals(totals, 900);

    expect(bounded).toEqual(totals);
    expect(clamped).toBe(false);
  });

  it("clamps a figure larger than the session could physically have emitted", () => {
    // The browser reports these numbers, so an inflated claim has to hit a wall.
    const { bounded, clamped } = boundTotals({ ...emptyTotals(), audioIn: 99_999_999 }, 900);

    expect(bounded.audioIn).toBe(900 * MAX_TOKENS_PER_SECOND);
    expect(clamped).toBe(true);
  });

  it("clamps each bucket on its own so one bad figure does not discard the rest", () => {
    const { bounded, clamped } = boundTotals(
      { ...emptyTotals(), audioIn: 99_999_999, textIn: 250 },
      900,
    );

    expect(bounded.audioIn).toBe(900 * MAX_TOKENS_PER_SECOND);
    expect(bounded.textIn).toBe(250); // untouched
    expect(clamped).toBe(true);
  });

  it("reports whether anything was clamped so the server can say so", () => {
    // A clamp means either a bug or a tampered client. Both are worth a log line.
    expect(boundTotals(emptyTotals(), 900).clamped).toBe(false);
  });
});

describe("toUsageRows", () => {
  it("emits one row per rate class, each naming its own model", () => {
    // The hard constraint: cost is per row at that row's own model rate.
    const rows = toUsageRows({
      audioIn: 100, audioOut: 50,
      textIn:  10,  textOut:  5,
      transcriptionIn: 40, transcriptionOut: 12,
    });

    expect(rows).toEqual([
      { model: "gpt-realtime-mini",      tokensIn: 100, tokensOut: 50 },
      { model: "gpt-realtime-mini-text", tokensIn: 10,  tokensOut: 5  },
      { model: "gpt-4o-mini-transcribe", tokensIn: 40,  tokensOut: 12 },
    ]);
  });

  it("drops empty rate classes so no spend event is logged that never happened", () => {
    const rows = toUsageRows({ ...emptyTotals(), audioIn: 100, audioOut: 50 });

    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe("gpt-realtime-mini");
  });

  it("keeps a class that has only output tokens", () => {
    const rows = toUsageRows({ ...emptyTotals(), textOut: 5 });
    expect(rows).toEqual([{ model: "gpt-realtime-mini-text", tokensIn: 0, tokensOut: 5 }]);
  });

  it("names models that lib/pricing.ts actually prices", async () => {
    // A model absent from MODEL_RATES falls back to Sonnet rates, which would
    // record realtime audio at roughly a third of its real cost. This test is
    // the tripwire for that.
    const { MODEL_RATES } = await import("@/lib/pricing");
    const rows = toUsageRows({
      audioIn: 1, audioOut: 1, textIn: 1, textOut: 1,
      transcriptionIn: 1, transcriptionOut: 1,
    });

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(MODEL_RATES).toHaveProperty(row.model);
    }
  });
});

describe("isEmpty", () => {
  it("is true for a session that reported nothing", () => {
    // Distinguishable from a session that spent, so the server can log the
    // difference rather than treating silence as a zero-cost session.
    expect(isEmpty(emptyTotals())).toBe(true);
  });

  it("is false as soon as any class has tokens", () => {
    expect(isEmpty({ ...emptyTotals(), textOut: 1 })).toBe(false);
  });
});
