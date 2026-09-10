import { describe, it, expect } from "vitest";
import { assertValidRequest, InvalidLlmRequestError } from "./validate";
import type { LlmRequest } from "./types";

const base: LlmRequest = {
  model:     "claude-haiku-4-5",
  maxTokens: 512,
  messages:  [{ role: "user", content: "Explain linear regression." }],
};

/**
 * These rules exist to make a provider switch boring. Every case below is one
 * where two providers disagree about what is malformed — and where the
 * disagreement would otherwise surface as a vendor 400 in production, after
 * something "worked locally" against a more forgiving server.
 */

describe("assertValidRequest", () => {
  it("accepts the shape every one of Hugh's call sites already sends", () => {
    expect(() => assertValidRequest(base)).not.toThrow();
    expect(() => assertValidRequest({ ...base, system: "You are Hugh." })).not.toThrow();
  });

  it("rejects an assistant-first conversation, which Anthropic refuses and OpenAI allows", () => {
    // The strictest provider's rule is applied to everyone on purpose: it is
    // the only way a request proven against Ollama is also known to work
    // against Claude. Letting each provider apply its own tolerance would make
    // this module a source of portability bugs instead of a cure for them.
    expect(() => assertValidRequest({
      ...base,
      messages: [{ role: "assistant", content: "Sure!" }, { role: "user", content: "Hi" }],
    })).toThrow(InvalidLlmRequestError);
  });

  it("rejects an empty message list instead of letting a provider decide what it means", () => {
    expect(() => assertValidRequest({ ...base, messages: [] })).toThrow(InvalidLlmRequestError);
  });

  it("rejects a blank message and says which one, since the vendor error will not", () => {
    try {
      assertValidRequest({
        ...base,
        messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "   " }],
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("message 1");
    }
  });

  it("rejects a zero or fractional token ceiling", () => {
    // Zero returns an empty reply that reads exactly like a refusal, which is
    // the most expensive kind of bug to diagnose from a log.
    expect(() => assertValidRequest({ ...base, maxTokens: 0 })).toThrow(InvalidLlmRequestError);
    expect(() => assertValidRequest({ ...base, maxTokens: -1 })).toThrow(InvalidLlmRequestError);
    expect(() => assertValidRequest({ ...base, maxTokens: 1.5 })).toThrow(InvalidLlmRequestError);
  });

  it("rejects a blank model rather than letting routing report the confusion", () => {
    expect(() => assertValidRequest({ ...base, model: "  " })).toThrow(InvalidLlmRequestError);
  });
});
