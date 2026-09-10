/**
 * Which provider serves a given model id.
 *
 * ── Why the provider is derived and never passed ───────────────────────────
 *
 * CLAUDE.md requires that a route name its model exactly once, so the API call
 * and the usage log cannot drift apart. A route that had to name a model AND a
 * provider would reintroduce exactly that hazard with two strings instead of
 * one. So the model id is the single binding and the provider is a pure
 * function of it.
 *
 * ── Why an unknown id throws instead of falling back ───────────────────────
 *
 * `lib/pricing.ts` deliberately treats an unknown model as the most expensive
 * one, because over-stating spend is safer than hiding it. Routing cannot copy
 * that instinct: the failure mode there is not a wrong number, it is sending a
 * learner's prompt to the wrong company. Guessing by prefix would do that
 * quietly the first time a model id did not match the pattern someone assumed.
 * A throw is loud, happens on the first call, and is caught by the route's
 * existing error handling.
 *
 * Pure and dependency-free: no SDK imports, no environment reads, no I/O. The
 * CI release gate runs without secrets, and this file is what lets the routing
 * decision be tested there.
 */
import type { LlmProvider } from "./types";

/**
 * Marks a model as served by a local Ollama daemon.
 *
 * Ollama has thousands of tags and they change constantly, so enumerating them
 * would mean a code edit before every experiment — friction on exactly the
 * activity this module exists to enable. A required prefix gets the
 * convenience without the risk the throw above protects against: no hosted
 * model id from any vendor begins with `ollama/`, so a prefixed id can never
 * be a cloud model that was mistyped, and an unprefixed one can never be
 * silently routed to localhost.
 *
 * The prefix is Hugh's naming, not Ollama's. `wireModelFor` strips it before
 * the call; `LlmResponse.model` keeps it, so a `usage_logs` row still says
 * plainly that the work was done locally.
 */
export const LOCAL_MODEL_PREFIX = "ollama/";

/**
 * Hosted models Hugh may call, and who serves them.
 *
 * Every entry here must also have a rate in `lib/pricing.ts` — asserted by a
 * test, so adding a model without pricing it fails CI rather than quietly
 * billing at the fallback rate.
 *
 * Realtime rate classes (`gpt-realtime-mini-text` and friends) are absent on
 * purpose: they are priced but never requested, because the Realtime mastery
 * coach speaks WebRTC from the browser and never passes through this module.
 */
export const HOSTED_MODEL_PROVIDERS: Readonly<Record<string, LlmProvider>> = {
  "claude-sonnet-4-6": "anthropic",
  "claude-haiku-4-5":  "anthropic",
  "gpt-4o":            "openai",
  "gpt-4o-mini":       "openai",
};

/** Thrown when a model id names nobody. Distinct class so callers can tell it
 *  from a provider outage — one is a config mistake, the other is weather. */
export class UnknownModelError extends Error {
  readonly model: string;

  constructor(model: string) {
    super(
      `Unknown model "${model}". Add it to HOSTED_MODEL_PROVIDERS in ` +
      `lib/llm/registry.ts (and give it a rate in lib/pricing.ts), or prefix ` +
      `a local model with "${LOCAL_MODEL_PREFIX}".`,
    );
    this.name  = "UnknownModelError";
    this.model = model;
  }
}

/** True when this id names a locally-served model. */
export function isLocalModel(model: string): boolean {
  return model.startsWith(LOCAL_MODEL_PREFIX) && model.length > LOCAL_MODEL_PREFIX.length;
}

/**
 * The provider for a model id. Throws `UnknownModelError` if it names nobody.
 */
export function providerFor(model: string): LlmProvider {
  if (isLocalModel(model)) return "ollama";

  const provider = HOSTED_MODEL_PROVIDERS[model];
  if (!provider) throw new UnknownModelError(model);
  return provider;
}

/**
 * The model name to put on the wire.
 *
 * Identical to the id for hosted models. For local ones the `ollama/` prefix is
 * Hugh's bookkeeping and would be a 404 if sent — Ollama knows the tag as
 * `llama3.2:3b`, not `ollama/llama3.2:3b`.
 */
export function wireModelFor(model: string): string {
  return isLocalModel(model) ? model.slice(LOCAL_MODEL_PREFIX.length) : model;
}

/** Whether this id can be called at all, without throwing to find out. */
export function isCallableModel(model: string): boolean {
  return isLocalModel(model) || model in HOSTED_MODEL_PROVIDERS;
}
