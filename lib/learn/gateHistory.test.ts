import { describe, it, expect } from "vitest";
import { recordAttempt, sanitizeHistory, MAX_REMEMBERED_ATTEMPTS } from "./gateHistory";

describe("recordAttempt — which attempts the judge gets to see", () => {
  it("remembers a needs_angle attempt so the next call can avoid repeating its suggestions", () => {
    expect(recordAttempt([], "Generative AI", "needs_angle")).toEqual(["Generative AI"]);
  });

  it("does not remember an in-domain topic, because the conversation ended there", () => {
    expect(recordAttempt(["Generative AI"], "Building RAG pipelines", "in")).toEqual(["Generative AI"]);
  });

  it("does not remember a declined topic, so a refused attempt cannot become pressure to relent", () => {
    // The gate must never accumulate a case for reversing itself. An 'out'
    // verdict is a decision, not a step in a conversation.
    expect(recordAttempt(["Generative AI"], "pass the nursing board", "out")).toEqual(["Generative AI"]);
  });

  it("treats retyping the same attempt in different case as the same attempt", () => {
    const history = recordAttempt(["Generative AI"], "generative ai", "needs_angle");
    expect(history).toEqual(["Generative AI"]);
  });

  it("ignores a blank attempt rather than putting an empty line in the prompt", () => {
    expect(recordAttempt(["AI"], "   ", "needs_angle")).toEqual(["AI"]);
  });

  it("keeps only the most recent attempts, so a wandering session cannot grow the prompt without bound", () => {
    let history: string[] = [];
    for (const t of ["AI", "big data", "the cloud", "automation", "analytics"]) {
      history = recordAttempt(history, t, "needs_angle");
    }
    expect(history).toHaveLength(MAX_REMEMBERED_ATTEMPTS);
    expect(history).toEqual(["the cloud", "automation", "analytics"]);
  });

  it("never mutates the history it was given", () => {
    const original = ["AI"];
    recordAttempt(original, "big data", "needs_angle");
    expect(original).toEqual(["AI"]);
  });

  it("trims surrounding whitespace before storing", () => {
    expect(recordAttempt([], "  Generative AI  ", "needs_angle")).toEqual(["Generative AI"]);
  });
});

describe("sanitizeHistory — the list arrives over the wire and is not trusted", () => {
  it("returns nothing for a non-array, so a malformed body cannot reach the prompt", () => {
    expect(sanitizeHistory("Generative AI")).toEqual([]);
    expect(sanitizeHistory(undefined)).toEqual([]);
    expect(sanitizeHistory({ 0: "AI" })).toEqual([]);
  });

  it("drops non-string entries a hand-rolled request could smuggle in", () => {
    expect(sanitizeHistory(["AI", 42, null, { topic: "x" }, "big data"])).toEqual(["AI", "big data"]);
  });

  it("drops blanks and collapses duplicates regardless of case", () => {
    expect(sanitizeHistory(["AI", "  ", "ai", "AI  "])).toEqual(["AI"]);
  });

  it("caps a long list, so a direct caller cannot inflate the prompt", () => {
    const many = Array.from({ length: 50 }, (_, i) => `topic ${i}`);
    expect(sanitizeHistory(many)).toHaveLength(MAX_REMEMBERED_ATTEMPTS);
  });

  it("keeps the most recent entries when capping, matching what the client would have sent", () => {
    expect(sanitizeHistory(["a", "b", "c", "d"])).toEqual(["b", "c", "d"]);
  });
});
