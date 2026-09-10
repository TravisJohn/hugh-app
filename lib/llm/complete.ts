/**
 * The one way Hugh calls a language model.
 *
 * Every route that spends tokens should reach a provider through here, so that
 * changing provider is a change to a model string rather than a change to
 * nineteen files. What this buys, concretely:
 *
 *   • Switching a route to another provider — or to a free local model — is a
 *     one-constant edit, and reverting it is the same edit backwards.
 *   • The token counts a route hands to `logUsage` come back in one shape,
 *     whatever served the call, so per-model cost accounting keeps working
 *     across providers instead of silently reading zeroes.
 *   • Vendor-specific behaviour (where the system prompt goes, what a cache
 *     hint means, which usage field is which) lives in one adapter each rather
 *     than being restated at every call site.
 *
 * ── What deliberately does NOT come through here ───────────────────────────
 *
 * The Realtime mastery coach. It is browser-side WebRTC against a credential
 * the server mints but never uses, it accounts for its own spend in
 * `lib/mastery/realtimeUsage.ts`, and no other provider offers an equivalent.
 * Routing it through a request/response seam would mean pretending it is one.
 * ElevenLabs TTS is out for the same reason — it returns audio, not tokens.
 *
 * ── Why there is no `server-only` import here ──────────────────────────────
 *
 * Deliberate, and it must stay that way. `server-only` throws the moment a
 * plain Node process touches it, so a `tsx` script could not import this file
 * at all — and the offline tooling that compares providers has to run the SAME
 * code a learner's request runs. If `scripts/llm-probe.ts` carried its own copy
 * of the routing, the translation and the token mapping, a comparison would
 * slowly drift into measuring the copy rather than the product, and the drift
 * would be invisible because both halves would keep passing their own tests.
 * `lib/tracker/generateMilestones.ts` documents this same constraint and exists
 * for the same reason.
 *
 * The protection this gives up is real but small: no secret is read in this
 * file. Keys are read lazily inside each adapter's client factory, and the
 * server-side concerns that DO need the boundary — usage logging, error
 * scrubbing — stay at the call sites, which is where they already live.

 * Vision is not supported yet: `LlmMessage.content` is a string. Notes Coach
 * (`gpt-4o`, image blocks) therefore still calls its SDK directly. Adding
 * images means widening the content type across every adapter, which is worth
 * doing when a second provider is actually in play and not before.
 */
import type { LlmRequest, LlmResponse } from "./types";
import { providerFor } from "./registry";
import { assertValidRequest } from "./validate";
import { callAnthropic } from "./providers/anthropic";
import { callOpenAiCompatible } from "./providers/openaiCompatible";

/**
 * Send one request to whichever provider the model id names.
 *
 * Throws `UnknownModelError` for a model nobody serves, `InvalidLlmRequestError`
 * for a malformed request, and whatever the provider SDK throws for a genuine
 * call failure. Those are deliberately three distinguishable classes: the first
 * two are configuration mistakes that will fail identically every time, and the
 * third is weather. A caller that retries the first two is burning time; a
 * caller that gives up on the third is failing a learner unnecessarily.
 *
 * Nothing is caught here. Retry and usage accounting already have a home in
 * `lib/claude/attemptWithUsage.ts`, which was written to keep a discarded
 * attempt's cost visible — swallowing an error at this level would hide the
 * very failures that helper exists to bill for.
 */
export async function complete(req: LlmRequest): Promise<LlmResponse> {
  assertValidRequest(req);

  const provider = providerFor(req.model);

  switch (provider) {
    case "anthropic":
      return callAnthropic(req);
    case "openai":
    case "ollama":
      return callOpenAiCompatible(req, provider);
  }
}
