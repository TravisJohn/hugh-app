import { describe, it, expect } from "vitest";
import type OpenAI from "openai";
import { toOpenAiParams, fromOpenAiCompletion, DEFAULT_OLLAMA_BASE_URL } from "./openaiCompatible";
import type { LlmRequest } from "../types";

const base: LlmRequest = {
  model:     "ollama/llama3.2:3b",
  maxTokens: 512,
  messages:  [{ role: "user", content: "Explain linear regression." }],
};

function completion(over: {
  content?:      string | null;
  usage?:        OpenAI.Completions.CompletionUsage | undefined;
  finishReason?: string;
} = {}): OpenAI.Chat.ChatCompletion {
  return {
    id:      "chatcmpl_1",
    object:  "chat.completion",
    created: 0,
    model:   "llama3.2:3b",
    choices: [{
      index:         0,
      message:       { role: "assistant", content: over.content === undefined ? "A line of best fit." : over.content, refusal: null },
      finish_reason: over.finishReason ?? "stop",
      logprobs:      null,
    }],
    usage: "usage" in over ? over.usage : { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
  } as OpenAI.Chat.ChatCompletion;
}

describe("toOpenAiParams", () => {
  it("sends the system prompt as the first message, the mirror of the Anthropic adapter", () => {
    const params = toOpenAiParams({ ...base, system: "You are Hugh." });
    expect(params.messages[0]).toEqual({ role: "system", content: "You are Hugh." });
    expect(params.messages[1]).toEqual({ role: "user", content: "Explain linear regression." });
  });

  it("sends no system message when there is none, rather than an empty one", () => {
    // An empty system turn is not nothing: some models treat it as an
    // instruction to be terse, which would silently change replies.
    const params = toOpenAiParams(base);
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
  });

  it("strips Hugh's ollama/ prefix, which the daemon would 404 on", () => {
    // Ollama knows this model as "llama3.2:3b". The prefix is Hugh's own
    // bookkeeping so a usage_logs row can say the work was done locally.
    expect(toOpenAiParams(base).model).toBe("llama3.2:3b");
  });

  it("leaves a hosted OpenAI model id untouched", () => {
    expect(toOpenAiParams({ ...base, model: "gpt-4o-mini" }).model).toBe("gpt-4o-mini");
  });

  it("carries the token ceiling across, since a local model will happily run past it", () => {
    expect(toOpenAiParams(base).max_tokens).toBe(512);
  });

  it("accepts a cache hint and sends nothing for it, because there is nothing honest to send", () => {
    // OpenAI caches automatically with no parameter; Ollama has no concept of
    // it at all. The caller learns the truth from cacheApplied instead.
    expect(toOpenAiParams({ ...base, cache: "1h" })).toEqual(toOpenAiParams(base));
  });
});

describe("fromOpenAiCompletion", () => {
  it("reads the reply out of the first choice", () => {
    expect(fromOpenAiCompletion(completion(), "ollama/llama3.2:3b", "ollama").text).toBe("A line of best fit.");
  });

  it("returns empty text for a null content rather than the string 'null'", () => {
    expect(fromOpenAiCompletion(completion({ content: null }), "ollama/llama3.2:3b", "ollama").text).toBe("");
  });

  it("maps OpenAI's token field names onto Hugh's, which is the whole portability trick", () => {
    // prompt_/completion_tokens against Anthropic's input_/output_tokens. Every
    // call site logs usage; getting this pairing wrong under-reports spend
    // without failing anything.
    const res = fromOpenAiCompletion(completion(), "ollama/llama3.2:3b", "ollama");
    expect(res.tokensIn).toBe(120);
    expect(res.tokensOut).toBe(45);
  });

  it("reports zero rather than guessing when a compatible server omits usage", () => {
    // usage is optional in the SDK's types and genuinely absent from some
    // OpenAI-compatible servers. Zero under-reports visibly; an estimate would
    // be a fabricated number in a cost table.
    const res = fromOpenAiCompletion(completion({ usage: undefined }), "ollama/llama3.2:3b", "ollama");
    expect(res.tokensIn).toBe(0);
    expect(res.tokensOut).toBe(0);
  });

  it("reports cacheApplied false for a local call, which has no caching at all", () => {
    expect(fromOpenAiCompletion(completion(), "ollama/llama3.2:3b", "ollama").cacheApplied).toBe(false);
  });

  it("reports cacheApplied true when OpenAI says it served cached prompt tokens", () => {
    const cached = completion({
      usage: { prompt_tokens: 2000, completion_tokens: 45, total_tokens: 2045, prompt_tokens_details: { cached_tokens: 1800 } },
    } as { usage: OpenAI.Completions.CompletionUsage });
    expect(fromOpenAiCompletion(cached, "gpt-4o", "openai").cacheApplied).toBe(true);
  });

  it("keeps Hugh's prefixed model id so pricing can tell a local call from a paid one", () => {
    // rateFor() reads this string. If the prefix were stripped here, a free
    // local call would be priced at the unknown-model fallback — Sonnet rates.
    const res = fromOpenAiCompletion(completion(), "ollama/llama3.2:3b", "ollama");
    expect(res.model).toBe("ollama/llama3.2:3b");
    expect(res.provider).toBe("ollama");
  });

  it("passes finish_reason through, so a truncated local reply is diagnosable too", () => {
    expect(fromOpenAiCompletion(completion({ finishReason: "length" }), "ollama/llama3.2:3b", "ollama").stopReason).toBe("length");
  });
});

describe("local daemon default", () => {
  it("points at Ollama's documented port so nothing needs configuring to try it", () => {
    expect(DEFAULT_OLLAMA_BASE_URL).toBe("http://localhost:11434/v1");
  });
});
