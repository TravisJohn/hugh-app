import { describe, it, expect } from "vitest";
import { masteryRecapPrompt } from "./prompts";

describe("masteryRecapPrompt", () => {
  const milestoneTitle = "BigQuery partitioning";
  const transcript = [
    { role: "coach" as const, text: "What stuck with you?" },
    { role: "learner" as const, text: "Partitioning by date cuts scanned bytes." },
  ];

  it("is explicitly UNMARKED — forbids scoring / pass-fail / rating", () => {
    const out = masteryRecapPrompt({ milestoneTitle, transcript });
    expect(out).toMatch(/NOT an assessment/i);
    expect(out).toMatch(/do NOT score them/i);
    expect(out).toMatch(/passed, failed, mastered/i);
  });

  it("grounds the recap in what the learner actually said", () => {
    const out = masteryRecapPrompt({ milestoneTitle, transcript });
    expect(out).toContain("Partitioning by date cuts scanned bytes.");
    expect(out).toMatch(/never invent points they didn't raise/i);
  });

  it("handles an empty transcript gracefully", () => {
    const out = masteryRecapPrompt({ milestoneTitle, transcript: [] });
    expect(out).toContain("(No conversation was captured.)");
    expect(out).toMatch(/wasn't much to reflect on/i);
  });
});
