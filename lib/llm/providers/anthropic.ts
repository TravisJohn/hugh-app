/**
 * Anthropic adapter.
 *
 * Split deliberately into pure translation and a thin I/O shell. The CI release
 * gate runs on a bare checkout with no secrets, so the parts worth testing —
 * where the system prompt goes, how a cache hint is expressed, which token
 * counts are billable, whether the cache actually engaged — must be reachable
 * without a key or a network. `callAnthropic` is the only function here that
 * touches the outside world, and it is a handful of lines by design.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { LlmRequest, LlmResponse } from "../types";
import { wireModelFor } from "../registry";

/**
 * Built lazily and reused.
 *
 * The key is read at CALL time rather than module-load time. Route modules are
 * imported before the environment is necessarily populated, and a client that
 * captured `undefined` at import would fail every request thereafter with an
 * error that points at the wrong thing. `lib/tracker/generateMilestones.ts`
 * already does this for the same reason.
 */
let cached: Anthropic | null = null;

function client(): Anthropic {
  if (!cached) cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

/**
 * The Anthropic-shaped parameters for one neutral request.
 *
 * Two translations happen here and nowhere else:
 *
 *  1. `system` is a top-level parameter, not a message. Anthropic models the
 *     system prompt as its own field; OpenAI models it as the first message.
 *     Neither is the neutral form, which is why `LlmRequest` keeps it separate.
 *
 *  2. A cache hint becomes `cache_control`, which the SDK places as an
 *     automatic breakpoint on the last message — reusing the system prompt plus
 *     the prior conversation prefix across turns. This mirrors exactly what
 *     `app/api/learn/chat/route.ts` has been doing in production; the shape is
 *     copied rather than reinvented because that one is known to work and is
 *     the bulk of Hugh's Claude spend.
 *
 * A `"none"` hint omits the field entirely rather than sending a disabled one,
 * so a non-caching call is byte-identical to what the call sites sent before
 * this module existed.
 */
export function toAnthropicParams(req: LlmRequest): Anthropic.MessageCreateParamsNonStreaming {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model:      wireModelFor(req.model),
    max_tokens: req.maxTokens,
    messages:   req.messages.map(m => ({ role: m.role, content: m.content })),
  };

  if (req.system) params.system = req.system;

  const cache = req.cache ?? "none";
  if (cache !== "none") {
    params.cache_control = cache === "1h"
      ? { type: "ephemeral", ttl: "1h" }
      : { type: "ephemeral" };
  }

  return params;
}

/**
 * Normalise an Anthropic reply into the neutral response.
 *
 * `requestedModel` is echoed back rather than read off the reply, because it
 * carries Hugh's own naming (the `ollama/` prefix convention, and the exact
 * string a route will hand to `logUsage`). What the provider calls the model is
 * not always what Hugh must record.
 *
 * ── The two judgement calls in here ────────────────────────────────────────
 *
 * `tokensIn` counts fresh input plus cache WRITES, and excludes cache reads.
 * That is not a rounding decision: it is the rule `learn/chat` already applies,
 * on the grounds that a read costs about a tenth as much and a warm cache
 * should ease the learner's quota rather than consume it. Routes that never
 * cache are unaffected, since those fields come back absent.
 *
 * `cacheApplied` reports whether caching ACTUALLY happened — measured from the
 * token counts — not whether it was requested. Anthropic silently skips the
 * cache when a prefix is below the model's minimum (~4096 tokens on Haiku), so
 * a flag set from the request would claim a saving that never occurred.
 */
export function fromAnthropicMessage(msg: Anthropic.Message, requestedModel: string): LlmResponse {
  const block = msg.content[0];
  const text  = block?.type === "text" ? block.text : "";

  const cacheWrites = msg.usage.cache_creation_input_tokens ?? 0;
  const cacheReads  = msg.usage.cache_read_input_tokens     ?? 0;

  return {
    text,
    tokensIn:     msg.usage.input_tokens + cacheWrites,
    tokensOut:    msg.usage.output_tokens,
    model:        requestedModel,
    provider:     "anthropic",
    cacheApplied: cacheWrites > 0 || cacheReads > 0,
    stopReason:   msg.stop_reason ?? null,
  };
}

/** Send one request. The only function in this file that does I/O. */
export async function callAnthropic(req: LlmRequest): Promise<LlmResponse> {
  const msg = await client().messages.create(toAnthropicParams(req));
  return fromAnthropicMessage(msg, req.model);
}
