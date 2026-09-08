import { describe, it, expect } from "vitest";
import { normalizeVerdict, mayProceed, openVerdict } from "./topic-domain";

describe("normalizeVerdict — the three verdicts", () => {
  it("passes a well-formed in-domain verdict through and lets it build a track", () => {
    const v = normalizeVerdict({ verdict: "in", reason: "sql is core data", message: "", suggestions: [] });
    expect(v.verdict).toBe("in");
    expect(mayProceed(v)).toBe(true);
  });

  it("blocks an out-of-domain verdict and keeps its learner-facing message", () => {
    const v = normalizeVerdict({
      verdict: "out",
      reason: "nursing licensure",
      message: "Hugh is built for data & analytics.",
      suggestions: [],
    });
    expect(v.verdict).toBe("out");
    expect(mayProceed(v)).toBe(false);
    expect(v.message).toBe("Hugh is built for data & analytics.");
  });

  it("holds an ambiguous topic at needs_angle rather than rejecting it", () => {
    const v = normalizeVerdict({
      verdict: "needs_angle",
      reason: "generative ai spans engineering and tool use",
      message: "Which angle did you mean?",
      suggestions: ["RAG pipelines and evaluation", "Fine-tuning for data teams"],
    });
    expect(v.verdict).toBe("needs_angle");
    // It blocks the build, but it is NOT a rejection — the UI reads the verdict,
    // not a boolean, to decide which of the two it shows.
    expect(mayProceed(v)).toBe(false);
    expect(v.suggestions).toHaveLength(2);
  });
});

describe("normalizeVerdict — fails open, because a broken judge is Hugh's fault", () => {
  it.each([
    ["null",              null],
    ["a bare string",     "out"],
    ["an empty object",   {}],
    ["an unknown verdict", { verdict: "maybe" }],
    ["a number verdict",  { verdict: 3 }],
  ])("lets the learner through when the response is %s", (_label, raw) => {
    expect(mayProceed(normalizeVerdict(raw))).toBe(true);
  });

  it("never leaks a fail-open message into the UI", () => {
    const v = normalizeVerdict({});
    expect(v.message).toBe("");
    expect(v.suggestions).toEqual([]);
  });
});

describe("normalizeVerdict — needs_angle must offer a way out", () => {
  it("downgrades needs_angle to in when the judge names no angles", () => {
    // Blocking with zero suggestions would be a question with no answers —
    // a dead end (CLAUDE.md rule 5). Let it through instead.
    const v = normalizeVerdict({ verdict: "needs_angle", message: "Which one?", suggestions: [] });
    expect(v.verdict).toBe("in");
    expect(v.reason).toBe("needs-angle-without-suggestions");
  });

  it("downgrades when the suggestions are present but blank", () => {
    const v = normalizeVerdict({ verdict: "needs_angle", suggestions: ["", "   "] });
    expect(v.verdict).toBe("in");
  });

  it("still blocks an out verdict that offers no suggestions", () => {
    // "out" is a statement, not a question, so it does not need answers to
    // be actionable — the copy alone tells the learner where they stand.
    const v = normalizeVerdict({ verdict: "out", message: "Outside Hugh's focus.", suggestions: [] });
    expect(v.verdict).toBe("out");
  });

  it("caps suggestions at three and drops non-strings", () => {
    const v = normalizeVerdict({
      verdict: "needs_angle",
      suggestions: ["a", "b", "c", "d", 5, null],
    });
    expect(v.suggestions).toEqual(["a", "b", "c"]);
  });
});

describe("normalizeVerdict — tolerates the old boolean shape", () => {
  it("reads a legacy inDomain:false as out", () => {
    const v = normalizeVerdict({ inDomain: false, message: "Outside the focus.", suggestions: ["SQL"] });
    expect(v.verdict).toBe("out");
    expect(v.suggestions).toEqual(["SQL"]);
  });

  it("reads a legacy inDomain:true as in", () => {
    expect(normalizeVerdict({ inDomain: true }).verdict).toBe("in");
  });

  it("prefers an explicit verdict over the legacy boolean", () => {
    const v = normalizeVerdict({ inDomain: false, verdict: "in" });
    expect(v.verdict).toBe("in");
  });
});

describe("openVerdict", () => {
  it("is permissive and carries a reason for the logs", () => {
    const v = openVerdict();
    expect(mayProceed(v)).toBe(true);
    expect(v.reason).toBe("classifier-unavailable");
  });
});
