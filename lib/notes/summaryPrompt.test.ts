import { describe, it, expect } from "vitest";
import { buildSummaryMessages, SUMMARY_SYSTEM_PROMPT, type SummaryThreadMessage } from "./summaryPrompt";

describe("buildSummaryMessages", () => {
  const thread: SummaryThreadMessage[] = [
    { role: "user", content: "I picked B because it's cheaper." },
    { role: "assistant", content: "Actually A is right — B trades away durability." },
  ];

  it("leads with the system prompt then one user turn", () => {
    const msgs = buildSummaryMessages(thread);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: "system", content: SUMMARY_SYSTEM_PROMPT });
    expect(msgs[1].role).toBe("user");
  });

  it("flattens the thread into a Learner/Hugh labelled transcript", () => {
    const [, user] = buildSummaryMessages(thread);
    const text = user.content as string;
    expect(text).toContain("Learner: I picked B because it's cheaper.");
    expect(text).toContain("Hugh: Actually A is right");
    // learner turn comes before Hugh's reply
    expect(text.indexOf("Learner:")).toBeLessThan(text.indexOf("Hugh:"));
  });

  it("handles a single-message thread", () => {
    const msgs = buildSummaryMessages([{ role: "user", content: "Only my thoughts." }]);
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content as string).toContain("Learner: Only my thoughts.");
  });
});
