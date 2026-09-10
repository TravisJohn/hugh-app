/**
 * Request rules that must hold before any provider sees a call.
 *
 * These exist because providers disagree about what is malformed, and the
 * disagreements are silent until they are not. Anthropic rejects an empty
 * message list and a conversation that opens with an assistant turn; OpenAI
 * accepts both and returns something plausible; Ollama may accept, hang, or
 * answer nonsense depending on the model. Discovering that difference as a
 * vendor 400 in production — after a provider switch that "worked locally" —
 * is exactly the failure this module is here to move forward in time.
 *
 * Pure by construction (CLAUDE.md rule 7): no clock, no I/O, no SDK, no
 * `server-only`. That is what lets the secretless CI gate check the rules.
 */
import type { LlmRequest } from "./types";

/** Thrown for a request that no provider should be asked to serve. */
export class InvalidLlmRequestError extends Error {
  constructor(reason: string) {
    super(`Invalid LLM request: ${reason}`);
    this.name = "InvalidLlmRequestError";
  }
}

/**
 * Throw unless the request is well-formed everywhere.
 *
 * The "first message must be a user turn" rule is the one that is not obvious.
 * It is Anthropic's constraint, not a neutral truth — but enforcing the
 * STRICTEST provider's rule for everyone is the only way a request that works
 * on Ollama is known to work on Claude. A wrapper that let each provider apply
 * its own tolerance would make the seam a source of portability bugs instead of
 * a cure for them.
 */
export function assertValidRequest(req: LlmRequest): void {
  if (!req.model.trim()) {
    throw new InvalidLlmRequestError("no model was named");
  }

  if (!Number.isInteger(req.maxTokens) || req.maxTokens < 1) {
    // A zero ceiling returns an empty reply that reads like a refusal, and a
    // fractional one is a vendor 400 that names the wrong cause.
    throw new InvalidLlmRequestError(`maxTokens must be a positive integer, got ${req.maxTokens}`);
  }

  if (req.messages.length === 0) {
    throw new InvalidLlmRequestError("messages was empty");
  }

  if (req.messages[0].role !== "user") {
    throw new InvalidLlmRequestError(
      `the first message must be a user turn, got "${req.messages[0].role}"`,
    );
  }

  const blank = req.messages.findIndex(m => !m.content.trim());
  if (blank !== -1) {
    throw new InvalidLlmRequestError(`message ${blank} has no content`);
  }
}
