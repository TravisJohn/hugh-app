/**
 * OpenAI-compatible adapter — serves both OpenAI and a local Ollama daemon.
 *
 * One file for two providers because they speak the same wire format:
 * `/v1/chat/completions`, same message shape, same `usage` field names. The
 * only differences are the base URL, whether a key means anything, and which
 * optional response fields actually arrive. Writing a second adapter that
 * differed only in a hostname would be duplication of exactly the kind
 * CLAUDE.md's DRY rule is about.
 *
 * They stay distinct *providers* in the registry regardless, because one bills
 * per token and the other does not — see `LlmProvider`.
 *
 * Same split as the Anthropic adapter: pure translation, thin I/O shell, so the
 * secretless CI gate can test the parts that hold the decisions.
 */
import OpenAI from "openai";
import type { LlmProvider, LlmRequest, LlmResponse } from "../types";
import { wireModelFor } from "../registry";

/**
 * Where a local daemon listens.
 *
 * Ollama's OpenAI-compatible surface lives under `/v1` on port 11434 by
 * default. Overridable because the daemon may run on another machine on the
 * network — which on modest hardware is the difference between a 3B model and
 * something worth comparing against Haiku.
 */
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

const clients = new Map<LlmProvider, OpenAI>();

/**
 * Built lazily per provider, for the load-ordering reason described in the
 * Anthropic adapter: environment variables are read at call time, never at
 * import time.
 *
 * Ollama ignores the key but the SDK refuses to construct without one, so a
 * placeholder is passed. That is not a credential and must never become one —
 * if a deployment ever needs a real key to reach a local daemon, it is not a
 * local daemon and belongs in `HOSTED_MODEL_PROVIDERS` instead.
 */
function client(provider: LlmProvider): OpenAI {
  const existing = clients.get(provider);
  if (existing) return existing;

  const created = provider === "ollama"
    ? new OpenAI({
        baseURL: process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
        apiKey:  "ollama", // ignored by the daemon; the SDK requires a value
      })
    : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  clients.set(provider, created);
  return created;
}

/**
 * The OpenAI-shaped parameters for one neutral request.
 *
 * The system prompt becomes the FIRST message rather than a separate field —
 * the mirror image of the Anthropic adapter, and the reason `LlmRequest` keeps
 * it out of the message list in the first place.
 *
 * `cache` is accepted and ignored. OpenAI caches long prompt prefixes
 * automatically with no parameter to set, and Ollama has no equivalent at all,
 * so there is nothing honest to send. The caller is told what really happened
 * through `cacheApplied` rather than being left to assume.
 */
export function toOpenAiParams(req: LlmRequest): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  for (const m of req.messages) messages.push({ role: m.role, content: m.content });

  return {
    model:      wireModelFor(req.model),
    max_tokens: req.maxTokens,
    messages,
  };
}

/**
 * Normalise an OpenAI-compatible reply into the neutral response.
 *
 * `usage` is optional in the SDK's types and genuinely absent from some
 * compatible servers, so it defaults to zero. That under-reports rather than
 * guesses, and is why the probe script prints the token counts it saw: a
 * provider that reports nothing should be visibly reporting nothing, not
 * silently costing nothing. Ollama does return real counts.
 *
 * `cacheApplied` is read from OpenAI's `cached_tokens`, which is the only
 * evidence its automatic caching engaged. Ollama never sends the field, so
 * local calls correctly report false.
 */
export function fromOpenAiCompletion(
  res:            OpenAI.Chat.ChatCompletion,
  requestedModel: string,
  provider:       LlmProvider,
): LlmResponse {
  const choice = res.choices[0];

  return {
    text:         choice?.message?.content ?? "",
    tokensIn:     res.usage?.prompt_tokens     ?? 0,
    tokensOut:    res.usage?.completion_tokens ?? 0,
    model:        requestedModel,
    provider,
    cacheApplied: (res.usage?.prompt_tokens_details?.cached_tokens ?? 0) > 0,
    stopReason:   choice?.finish_reason ?? null,
  };
}

/** Send one request. The only function in this file that does I/O. */
export async function callOpenAiCompatible(
  req:      LlmRequest,
  provider: LlmProvider,
): Promise<LlmResponse> {
  const res = await client(provider).chat.completions.create(toOpenAiParams(req));
  return fromOpenAiCompletion(res, req.model, provider);
}
