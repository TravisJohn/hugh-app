import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { toAnthropicParams, fromAnthropicMessage } from "./anthropic";
import type { LlmRequest } from "../types";

const base: LlmRequest = {
  model:     "claude-haiku-4-5",
  maxTokens: 512,
  messages:  [{ role: "user", content: "Explain linear regression." }],
};

/** A well-formed reply, with only the fields this adapter reads varied. */
function reply(over: {
  text?:        string;
  inputTokens?: number;
  cacheWrites?: number;
  cacheReads?:  number;
  stopReason?:  string | null;
} = {}): Anthropic.Message {
  return {
    id:      "msg_1",
    type:    "message",
    role:    "assistant",
    model:   "claude-haiku-4-5",
    content: [{ type: "text", text: over.text ?? "Regression fits a line.", citations: null }],
    stop_reason:   over.stopReason === undefined ? "end_turn" : over.stopReason,
    stop_sequence: null,
    usage: {
      input_tokens:                over.inputTokens ?? 100,
      output_tokens:              40,
      cache_creation_input_tokens: over.cacheWrites ?? null,
      cache_read_input_tokens:     over.cacheReads  ?? null,
    },
  } as Anthropic.Message;
}

describe("toAnthropicParams", () => {
  it("sends the system prompt as its own field, not as a message", () => {
    // Anthropic models the system prompt as a parameter and OpenAI models it
    // as the first message. Neither is neutral, which is why LlmRequest keeps
    // it separate and each adapter places it.
    const params = toAnthropicParams({ ...base, system: "You are Hugh." });
    expect(params.system).toBe("You are Hugh.");
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0]).toEqual({ role: "user", content: "Explain linear regression." });
  });

  it("omits system entirely when there is none, so the call matches what routes sent before", () => {
    // 18 of Hugh's 22 call sites send no system prompt. Their requests must be
    // byte-identical through this seam or the seam itself becomes a variable.
    expect("system" in toAnthropicParams(base)).toBe(false);
  });

  it("sends no cache_control by default, keeping non-caching routes unchanged", () => {
    expect("cache_control" in toAnthropicParams(base)).toBe(false);
    expect("cache_control" in toAnthropicParams({ ...base, cache: "none" })).toBe(false);
  });

  it("expresses a 1h hint as the long TTL that learn/chat relies on during focus blocks", () => {
    // A Pomodoro block leaves >5min gaps between questions, which expires the
    // default cache and forces a re-write each turn. This is the shape that
    // route already sends in production.
    expect(toAnthropicParams({ ...base, cache: "1h" }).cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("expresses a 5m hint as the default ephemeral breakpoint", () => {
    expect(toAnthropicParams({ ...base, cache: "5m" }).cache_control).toEqual({ type: "ephemeral" });
  });

  it("strips Hugh's local prefix from the wire model, so a mis-set id fails loudly here", () => {
    expect(toAnthropicParams({ ...base, model: "claude-haiku-4-5" }).model).toBe("claude-haiku-4-5");
  });
});

describe("fromAnthropicMessage", () => {
  it("reads the reply text out of the first content block", () => {
    expect(fromAnthropicMessage(reply({ text: "A line of best fit." }), "claude-haiku-4-5").text)
      .toBe("A line of best fit.");
  });

  it("returns empty text rather than throwing when the block is not text", () => {
    // Callers already handle an empty reply; a throw here would turn a rare odd
    // response into a 500 on a route that had a perfectly good fallback.
    const odd = { ...reply(), content: [] } as Anthropic.Message;
    expect(fromAnthropicMessage(odd, "claude-haiku-4-5").text).toBe("");
  });

  it("counts cache writes as billable input but not cache reads", () => {
    // This is learn/chat's existing rule, preserved deliberately: a read costs
    // about a tenth as much, and a warm cache should ease a learner's quota
    // rather than consume it.
    const res = fromAnthropicMessage(reply({ inputTokens: 100, cacheWrites: 900, cacheReads: 5000 }), "claude-haiku-4-5");
    expect(res.tokensIn).toBe(1000);
  });

  it("reports cacheApplied from what happened, not from what was asked for", () => {
    // Anthropic silently skips the cache below a model's minimum prefix
    // (~4096 tokens on Haiku). A flag copied from the request would claim a
    // saving that never occurred — and learn/chat's whole cost story rests on
    // this actually engaging.
    expect(fromAnthropicMessage(reply({ cacheWrites: 900 }), "claude-haiku-4-5").cacheApplied).toBe(true);
    expect(fromAnthropicMessage(reply({ cacheReads: 900 }),  "claude-haiku-4-5").cacheApplied).toBe(true);
    expect(fromAnthropicMessage(reply(), "claude-haiku-4-5").cacheApplied).toBe(false);
  });

  it("echoes back the model id Hugh asked for, which is what usage logging must record", () => {
    // CLAUDE.md's "name the model once" rule has to survive a function
    // boundary: the caller logs from what comes back.
    expect(fromAnthropicMessage(reply(), "claude-haiku-4-5").model).toBe("claude-haiku-4-5");
    expect(fromAnthropicMessage(reply(), "claude-haiku-4-5").provider).toBe("anthropic");
  });

  it("passes stop_reason through verbatim so a truncated reply stays diagnosable", () => {
    expect(fromAnthropicMessage(reply({ stopReason: "max_tokens" }), "claude-haiku-4-5").stopReason).toBe("max_tokens");
    expect(fromAnthropicMessage(reply({ stopReason: null }), "claude-haiku-4-5").stopReason).toBeNull();
  });
});
