import { describe, it, expect } from "vitest";
import { buildTranscriptMarkdown, transcriptFilename } from "./transcript";

const at = new Date("2026-07-07T09:30:00.000Z");

describe("buildTranscriptMarkdown", () => {
  const turns = [
    { role: "assistant" as const, content: "Hi! I'm Hugh." },
    { role: "user" as const, content: "What is a closure?" },
    { role: "assistant" as const, content: "A closure is...\n```py\nx = 1\n```" },
  ];

  it("includes topic, focus, ISO export time, and labels each turn", () => {
    const md = buildTranscriptMarkdown(turns, { topic: "Python", milestoneTitle: "Closures", at });
    expect(md).toContain("**Topic:** Python");
    expect(md).toContain("**Focus:** Closures");
    expect(md).toContain("**Exported:** 2026-07-07T09:30:00.000Z");
    expect(md).toContain("### You");
    expect(md).toContain("### Hugh");
    expect(md).toContain("What is a closure?");
    expect(md).toContain("```py"); // code fences survive intact
  });

  it("omits the Focus line when there's no milestone", () => {
    const md = buildTranscriptMarkdown(turns, { topic: "Python", at });
    expect(md).not.toContain("**Focus:**");
  });
});

describe("transcriptFilename", () => {
  it("slugifies the topic and stamps the date", () => {
    expect(transcriptFilename("Pandas & SQL basics!", at)).toBe("hugh-ask-pandas-sql-basics-2026-07-07.md");
  });

  it("falls back to 'session' when the topic has no usable characters", () => {
    expect(transcriptFilename("!!!", at)).toBe("hugh-ask-session-2026-07-07.md");
  });
});
