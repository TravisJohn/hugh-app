import { describe, it, expect } from "vitest";
import { buildCoachMessages, COACH_SYSTEM_PROMPT, imagePreamble, type CoachThreadMessage } from "./coachPrompt";

describe("buildCoachMessages", () => {
  const thread: CoachThreadMessage[] = [
    { role: "user", content: "I picked B because it's cheaper." },
    { role: "assistant", content: "Actually A is right..." },
    { role: "user", content: "Why though?" },
  ];

  it("always leads with the system prompt", () => {
    const msgs = buildCoachMessages(thread, []);
    expect(msgs[0]).toEqual({ role: "system", content: COACH_SYSTEM_PROMPT });
  });

  it("preserves the thread order and roles after the system prompt", () => {
    const msgs = buildCoachMessages(thread, []);
    // no images → system + 3 thread messages
    expect(msgs).toHaveLength(4);
    expect(msgs.slice(1)).toEqual([
      { role: "user", content: "I picked B because it's cheaper." },
      { role: "assistant", content: "Actually A is right..." },
      { role: "user", content: "Why though?" },
    ]);
  });

  it("inserts a single image-bearing user message before the thread when images exist", () => {
    const msgs = buildCoachMessages(thread, ["data:image/png;base64,AAA", "data:image/png;base64,BBB"]);
    // system + image message + 3 thread messages
    expect(msgs).toHaveLength(5);
    const imageMsg = msgs[1];
    expect(imageMsg.role).toBe("user");
    expect(Array.isArray(imageMsg.content)).toBe(true);
    const parts = imageMsg.content as Array<{ type: string; image_url?: { url: string } }>;
    // one text preamble + two image parts
    expect(parts[0].type).toBe("text");
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(parts[1].image_url?.url).toBe("data:image/png;base64,AAA");
  });

  it("does not add an image message when there are no images", () => {
    const msgs = buildCoachMessages(thread, []);
    expect(msgs.some((m) => Array.isArray(m.content))).toBe(false);
  });

  it("handles an empty thread (images only)", () => {
    const msgs = buildCoachMessages([], ["data:image/png;base64,AAA"]);
    expect(msgs).toHaveLength(2); // system + image message
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
  });

  it("tells the model a multi-snip bucket is one question, not several", () => {
    const msgs = buildCoachMessages([], ["data:a", "data:b"]);
    const parts = msgs[1].content as Array<{ type: string; text?: string }>;
    expect(parts[0].text).toBe(imagePreamble(2));
  });
});

// The whole point of buckets: two snips of one tall question must not be read
// as two questions, or the Coach answers something the learner never asked.
describe("imagePreamble", () => {
  it("frames several images as ordered slices of a single question", () => {
    const text = imagePreamble(2);
    expect(text).toContain("2 slices");
    expect(text).toContain("single question");
    expect(text).toContain("top to bottom");
  });

  it("stays in the singular for an ordinary one-snip screenshot", () => {
    expect(imagePreamble(1)).not.toContain("slices");
  });

  it("warns the system prompt's reader that extra images continue the same page", () => {
    expect(COACH_SYSTEM_PROMPT).toContain("consecutive slices of ONE");
    expect(COACH_SYSTEM_PROMPT).toContain("never as separate questions");
  });
});
