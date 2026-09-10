/**
 * The provider-neutral shape of one LLM call.
 *
 * Hugh made 22 model calls across 19 files before this module existed, and
 * every one of them passed exactly the same four things: a model, a token
 * ceiling, a list of messages, and — at four sites — a system prompt. Nothing
 * in the codebase used temperature, top_p, stop sequences, streaming, tool
 * definitions or structured-output schemas. That is not an accident of style;
 * it is the actual surface Hugh needs, and it is small enough that swapping
 * providers is a translation problem rather than a rewrite.
 *
 * These types are therefore deliberately NARROW. They describe what Hugh
 * sends, not what Anthropic or OpenAI can accept. A field belongs here only
 * once a real call site needs it — a neutral interface that mirrors one
 * vendor's full API is just that vendor's SDK wearing a different name, and it
 * would drag every other provider into emulating parameters nobody sends.
 *
 * No SDK types are imported here, by design. This file must stay loadable in a
 * unit test with no API key, no network and no vendor package resolution, which
 * is what lets the CI release gate stay secretless.
 */

/**
 * Where a call is served from.
 *
 * `ollama` is listed separately from `openai` even though it speaks the same
 * wire format, because the two differ in every way that matters operationally:
 * one bills per token and needs a key, the other runs on localhost for free and
 * can simply be switched off. Collapsing them would make "is this call costing
 * money?" unanswerable from the model id alone.
 */
export type LlmProvider = "anthropic" | "openai" | "ollama";

/**
 * Conversation roles Hugh actually sends.
 *
 * There is no `system` role: the system prompt is a top-level field on the
 * request instead. Anthropic takes it as its own parameter and OpenAI takes it
 * as the first message, so neither wire format is the neutral one — keeping it
 * separate lets each adapter place it correctly and matches how all 22 call
 * sites are already written.
 */
export type LlmRole = "user" | "assistant";

export interface LlmMessage {
  role:    LlmRole;
  content: string;
}

/**
 * How long a provider should be asked to hold a prompt prefix in cache.
 *
 * A hint, never a guarantee — see `LlmResponse.cacheApplied`. Anthropic takes
 * an explicit breakpoint with a TTL; OpenAI caches automatically with no
 * parameter to set; Ollama has no equivalent concept at all. Every value is
 * therefore meaningful to at most one adapter, and the others must say so
 * rather than pretend.
 */
export type CacheHint = "none" | "5m" | "1h";

export interface LlmRequest {
  /** Model id. Also selects the provider — see `lib/llm/registry.ts`. */
  model:     string;
  maxTokens: number;
  /** Optional; only four of Hugh's call sites send one. */
  system?:   string;
  messages:  readonly LlmMessage[];
  /** Defaults to `"none"`. Honoured where supported, reported back always. */
  cache?:    CacheHint;
}

export interface LlmResponse {
  /** The reply text. Empty string when the model returned no text block. */
  text:      string;
  tokensIn:  number;
  tokensOut: number;

  /**
   * The model that ACTUALLY served the call, not the one requested.
   *
   * CLAUDE.md's "every route names its model once" rule has to survive a
   * function boundary: the caller logs usage from what came back, so the API
   * call and the `usage_logs` row cannot disagree about what was billed. This
   * mirrors what `generateMilestones` already does for the same reason.
   */
  model:     string;
  provider:  LlmProvider;

  /**
   * Whether the `cache` hint was actually applied by this provider.
   *
   * This exists because of architecture rule 5. `learn/chat` is the bulk of
   * Hugh's Claude spend precisely BECAUSE of its 1h cache breakpoint, so a
   * wrapper that silently dropped that hint when pointed at another provider
   * would turn a large cost regression into something you discover from a bill
   * rather than from the code. A dropped hint is a fact the caller is entitled
   * to see, not an implementation detail.
   */
  cacheApplied: boolean;

  /**
   * Why generation stopped, verbatim from the provider, or null if it said
   * nothing. Not normalised across vendors: `learn/chat` logs this to diagnose
   * truncated replies, and a value invented by this layer would be worse than
   * no value at all.
   */
  stopReason: string | null;
}
