import { describe, it, expect } from "vitest";
import {
  coerceMasteryResult,
  parseMasteryResult,
  parseStoredMasteryFeedback,
} from "./result";

const validRaw = JSON.stringify({
  version: 1,
  masteryStatus: "mastered",
  masteryScore: 8,
  strengths: ["clear on partitioning"],
  misconceptions: [],
  missingConcepts: ["clustering"],
  recommendedReview: ["clustering docs"],
  suggestedNextStep: "Practice a clustering scenario.",
  supportingTranscriptEvidence: ["'Partition by transaction_date'"],
});

describe("parseMasteryResult (evaluator output validation)", () => {
  it("parses and validates good JSON", () => {
    const r = parseMasteryResult(validRaw);
    expect(r).not.toBeNull();
    expect(r!.masteryScore).toBe(8);
    expect(r!.masteryStatus).toBe("mastered");
    expect(r!.missingConcepts).toEqual(["clustering"]);
  });

  it("strips markdown fences", () => {
    const r = parseMasteryResult("```json\n" + validRaw + "\n```");
    expect(r).not.toBeNull();
  });

  it("returns null on malformed JSON (so the route can reject, not persist)", () => {
    expect(parseMasteryResult("not json at all")).toBeNull();
    expect(parseMasteryResult("{ oops")).toBeNull();
  });

  it("returns null when the score is missing/non-numeric", () => {
    expect(parseMasteryResult(JSON.stringify({ masteryStatus: "mastered" }))).toBeNull();
    expect(parseMasteryResult(JSON.stringify({ masteryScore: "eight" }))).toBeNull();
  });

  it("clamps out-of-range scores and derives status when invalid", () => {
    const r = coerceMasteryResult({ masteryScore: 99, masteryStatus: "bogus" });
    expect(r!.masteryScore).toBe(10);
    expect(r!.masteryStatus).toBe("mastered");
    const low = coerceMasteryResult({ masteryScore: 2 });
    expect(low!.masteryStatus).toBe("not_yet");
  });

  it("caps arrays to keep the stored payload concise", () => {
    const r = coerceMasteryResult({
      masteryScore: 5,
      strengths: ["a", "b", "c", "d", "e", "f", "g"],
    });
    expect(r!.strengths.length).toBe(5);
  });
});

describe("parseStoredMasteryFeedback (defensive UI read)", () => {
  it("handles empty / null", () => {
    expect(parseStoredMasteryFeedback(null).kind).toBe("empty");
    expect(parseStoredMasteryFeedback("   ").kind).toBe("empty");
  });

  it("reads new versioned JSON as structured", () => {
    const parsed = parseStoredMasteryFeedback(validRaw);
    expect(parsed.kind).toBe("structured");
    if (parsed.kind === "structured") expect(parsed.result.masteryScore).toBe(8);
  });

  it("keeps historical PLAIN-TEXT feedback working", () => {
    const parsed = parseStoredMasteryFeedback("Solid grasp of partitioning; tighten clustering.");
    expect(parsed.kind).toBe("text");
    if (parsed.kind === "text") expect(parsed.text).toContain("Solid grasp");
  });

  it("falls back to text on malformed JSON without throwing", () => {
    const parsed = parseStoredMasteryFeedback('{ "masteryScore": ');
    expect(parsed.kind).toBe("text");
  });

  it("treats valid-but-wrong-shape JSON as text (never breaks the record)", () => {
    const parsed = parseStoredMasteryFeedback('{"foo":"bar"}');
    expect(parsed.kind).toBe("text");
  });
});
