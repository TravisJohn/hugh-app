import { describe, it, expect } from "vitest";
import { parseChatResponse } from "./parse";

describe("parseChatResponse — strict path", () => {
  it("parses well-formed JSON", () => {
    const raw = JSON.stringify({ reply: "Hello", isOffTopic: false, codeExample: null });
    expect(parseChatResponse(raw)).toEqual({ reply: "Hello", isOffTopic: false, codeExample: null, covered: false });
  });

  it("strips markdown fences around the JSON", () => {
    const raw = "```json\n" + JSON.stringify({ reply: "Hi", isOffTopic: true, codeExample: null }) + "\n```";
    expect(parseChatResponse(raw)).toEqual({ reply: "Hi", isOffTopic: true, codeExample: null, covered: false });
  });

  it("reads the covered flag when Hugh sets it", () => {
    const raw = JSON.stringify({ reply: "Nice work", isOffTopic: false, codeExample: null, covered: true });
    expect(parseChatResponse(raw).covered).toBe(true);
  });

  it("defaults covered to false when absent", () => {
    const raw = JSON.stringify({ reply: "Hi", isOffTopic: false, codeExample: null });
    expect(parseChatResponse(raw).covered).toBe(false);
  });

  it("keeps a well-formed code example", () => {
    const raw = JSON.stringify({
      reply: "Try this",
      isOffTopic: false,
      codeExample: { language: "Python", code: "x = 1" },
    });
    expect(parseChatResponse(raw).codeExample).toEqual({ language: "python", code: "x = 1" });
  });

  it("drops an empty/partial code example", () => {
    const raw = JSON.stringify({ reply: "r", isOffTopic: false, codeExample: { language: "python", code: "  " } });
    expect(parseChatResponse(raw).codeExample).toBeNull();
  });
});

describe("parseChatResponse — salvage path (the leak bug)", () => {
  // The exact failure shape: unescaped inner double quotes in `reply` (here
  // around "Create a simple series") make JSON.parse throw. The old code then
  // showed the whole object to the learner.
  const broken =
    '{"reply": "Good start — you\'ve got it.\\n\\n1. Your comment says "Create a simple series" which is fine.\\n2. Add a comment on print(scores) too.", "isOffTopic": false, "codeExample": null}';

  it("recovers the reply text instead of dumping raw JSON", () => {
    const out = parseChatResponse(broken);
    expect(out.reply.startsWith("Good start")).toBe(true);
    expect(out.reply).toContain('"Create a simple series"'); // inner quotes preserved
    expect(out.reply).not.toContain('"isOffTopic"');           // delimiter not leaked
    expect(out.reply).not.toContain('{"reply"');               // no JSON scaffolding
  });

  it("decodes escaped newlines in the salvaged reply", () => {
    expect(parseChatResponse(broken).reply).toContain("\n");
  });

  it("still recovers isOffTopic and codeExample", () => {
    const out = parseChatResponse(broken);
    expect(out.isOffTopic).toBe(false);
    expect(out.codeExample).toBeNull();
  });

  it("recovers covered=true from a reply with unescaped quotes", () => {
    const raw = '{"reply": "You nailed the "join" concept.", "isOffTopic": false, "codeExample": null, "covered": true}';
    expect(parseChatResponse(raw).covered).toBe(true);
  });

  it("salvages a code example whose code has unescaped quotes", () => {
    const raw = '{"reply": "Here:", "isOffTopic": false, "codeExample": {"language": "python", "code": "print("hi")"}}';
    const out = parseChatResponse(raw);
    expect(out.codeExample?.language).toBe("python");
    expect(out.codeExample?.code).toBe('print("hi")');
  });

  it("falls back to showing plain prose when the model ignores the JSON contract", () => {
    // Regression guard: a non-JSON reply must surface, not trigger the route's
    // "I couldn't generate a response" fallback.
    const out = parseChatResponse("A data lake stores raw, unprocessed data.");
    expect(out.reply).toBe("A data lake stores raw, unprocessed data.");
    expect(out.isOffTopic).toBe(false);
    expect(out.codeExample).toBeNull();
  });

  it("strips fences before echoing plain prose", () => {
    expect(parseChatResponse("```\njust some text\n```").reply).toBe("just some text");
  });

  it("does NOT echo a raw JSON object it failed to bind (no brace leak)", () => {
    // Has a "reply": field but in a shape salvage can't bind → stay empty so the
    // caller shows its generic fallback rather than leaking braces.
    const out = parseChatResponse('{"reply":');
    expect(out.reply).toBe("");
  });
});
