import { describe, it, expect } from "vitest";
import {
  buildCoachInstructions,
  buildEvaluationPrompt,
  buildGuidedCoachInstructions,
} from "./masteryInstructions";

const criteriaText = `Topic: "BigQuery partitioning"\nKey concepts... Partition pruning`;

describe("buildCoachInstructions", () => {
  it("embeds the authoritative criteria and the conclude tool", () => {
    const out = buildCoachInstructions({ criteriaText });
    expect(out).toContain("Partition pruning");
    expect(out).toContain("conclude_assessment");
  });

  it("forbids the coach from scoring or deciding pass/fail (app owns the result)", () => {
    const out = buildCoachInstructions({ criteriaText });
    expect(out).toMatch(/do NOT score/i);
    expect(out).toMatch(/do NOT tell them whether they passed/i);
    expect(out).toMatch(/application owns the result/i);
  });

  it("pushes application to a NEW scenario, not recitation", () => {
    const out = buildCoachInstructions({ criteriaText });
    expect(out).toMatch(/apply/i);
    expect(out).toMatch(/not just define/i);
  });

  it("labels diary context as non-authoritative when present, omits it otherwise", () => {
    const withDiary = buildCoachInstructions({ criteriaText, diaryContext: "my note" });
    expect(withDiary).toContain("my note");
    expect(withDiary).toMatch(/NOT as authoritative truth/i);

    const without = buildCoachInstructions({ criteriaText });
    expect(without).not.toMatch(/diary notes/i);
  });
});

describe("buildGuidedCoachInstructions", () => {
  const topicTitle = "BigQuery partitioning";

  it("anchors to the on-screen summary document when present", () => {
    const out = buildGuidedCoachInstructions({
      topicTitle,
      summaryDoc: "## Key idea\nPartition pruning cuts scanned bytes.",
    });
    expect(out).toContain("Partition pruning cuts scanned bytes.");
    expect(out).toMatch(/same document shown on their screen/i);
  });

  it("opens the floor for the learner's own spoken reflection", () => {
    const out = buildGuidedCoachInstructions({ topicTitle });
    expect(out).toMatch(/OPEN by warmly inviting the learner to reflect in their OWN words/);
    expect(out).toMatch(/let their reflection steer you/i);
  });

  it("is explicitly UNMARKED — no scoring, no pass/fail, no verdict", () => {
    const out = buildGuidedCoachInstructions({ topicTitle, summaryDoc: "x" });
    expect(out).toMatch(/not grading them/i);
    expect(out).toMatch(/no pass or fail/i);
    expect(out).toMatch(/never announce an assessment/i);
    // The conclude tool contract from the graded flow must be absent here.
    expect(out).not.toMatch(/conclude_assessment/);
  });

  it("does not wrap up on its own — the learner decides when to end", () => {
    const out = buildGuidedCoachInstructions({ topicTitle });
    expect(out).toMatch(/the learner decides when to end/i);
  });

  it("falls back to supporting context only when no summary exists", () => {
    const out = buildGuidedCoachInstructions({ topicTitle, fallbackContext: "my rough notes" });
    expect(out).toContain("my rough notes");
    expect(out).toMatch(/No written summary exists yet/i);
  });
});

describe("buildEvaluationPrompt", () => {
  const transcript = [
    { role: "coach" as const, text: "How would you design the table?" },
    { role: "learner" as const, text: "Partition by transaction_date." },
  ];

  it("includes criteria, transcript, and the end reason", () => {
    const out = buildEvaluationPrompt({ criteriaText, transcript, endReason: "coach_concluded" });
    expect(out).toContain("Partition pruning");
    expect(out).toContain("Partition by transaction_date.");
    expect(out).toContain("coach_concluded");
  });

  it("demands transcript-grounded evidence and the exact JSON schema", () => {
    const out = buildEvaluationPrompt({ criteriaText, transcript, endReason: "max_duration" });
    expect(out).toMatch(/never credit a skill that does not appear/i);
    expect(out).toMatch(/supportingTranscriptEvidence/);
    expect(out).toMatch(/"version": 1/);
    expect(out).toMatch(/"masteryScore"/);
  });

  it("warns not to assume mastery when the session was cut short", () => {
    const out = buildEvaluationPrompt({ criteriaText, transcript, endReason: "inactivity" });
    expect(out).toMatch(/do not assume mastery you did not observe/i);
  });
});
