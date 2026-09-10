import { describe, it, expect } from "vitest";
import {
  providerFor,
  wireModelFor,
  isLocalModel,
  isCallableModel,
  UnknownModelError,
  HOSTED_MODEL_PROVIDERS,
  LOCAL_MODEL_PREFIX,
} from "./registry";
import { isKnownModel, rateFor } from "@/lib/pricing";

/**
 * Routing decides which COMPANY receives a learner's prompt. Every test here
 * is really about that: a mis-route is not a wrong number, it is data going
 * somewhere it was never meant to go, and unlike a pricing slip it cannot be
 * corrected after the fact.
 */

describe("providerFor", () => {
  it("routes each hosted model to the vendor that actually serves it", () => {
    expect(providerFor("claude-sonnet-4-6")).toBe("anthropic");
    expect(providerFor("claude-haiku-4-5")).toBe("anthropic");
    expect(providerFor("gpt-4o")).toBe("openai");
    expect(providerFor("gpt-4o-mini")).toBe("openai");
  });

  it("routes any ollama-prefixed id to the local daemon without needing to know the tag", () => {
    // The prefix exists so trying a new local model is not a code change.
    // Ollama has thousands of tags; enumerating them would put friction on
    // exactly the experimentation this module was built to allow.
    expect(providerFor("ollama/llama3.2:3b")).toBe("ollama");
    expect(providerFor("ollama/qwen2.5:7b")).toBe("ollama");
    expect(providerFor("ollama/something-released-next-year")).toBe("ollama");
  });

  it("throws on an unknown model rather than guessing a provider", () => {
    // lib/pricing.ts answers an unknown model by over-charging, which is safe
    // because the worst case is a pessimistic number. Routing has no such safe
    // default: a guess sends the prompt to the wrong company.
    expect(() => providerFor("gemini-2.0-flash")).toThrow(UnknownModelError);
    expect(() => providerFor("")).toThrow(UnknownModelError);
  });

  it("names the offending model on the error so the fix is obvious from the log", () => {
    try {
      providerFor("mistral-large");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownModelError);
      expect((err as UnknownModelError).model).toBe("mistral-large");
      expect((err as UnknownModelError).message).toContain("mistral-large");
    }
  });

  it("does not treat a bare prefix as a local model, since it names no tag", () => {
    // "ollama/" alone would send an empty model name to the daemon and get an
    // error that blames the wrong thing.
    expect(isLocalModel(LOCAL_MODEL_PREFIX)).toBe(false);
    expect(() => providerFor(LOCAL_MODEL_PREFIX)).toThrow(UnknownModelError);
  });
});

describe("wireModelFor", () => {
  it("strips the ollama prefix, which is Hugh's bookkeeping and not a real tag", () => {
    // The daemon knows this model as "llama3.2:3b". Sending the prefixed form
    // is a 404 whose message does not explain itself.
    expect(wireModelFor("ollama/llama3.2:3b")).toBe("llama3.2:3b");
  });

  it("leaves hosted model ids exactly as the vendor knows them", () => {
    expect(wireModelFor("claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(wireModelFor("gpt-4o")).toBe("gpt-4o");
  });
});

describe("isCallableModel", () => {
  it("answers without throwing, so a caller can check before committing to a call", () => {
    expect(isCallableModel("claude-haiku-4-5")).toBe(true);
    expect(isCallableModel("ollama/llama3.2:3b")).toBe(true);
    expect(isCallableModel("gemini-2.0-flash")).toBe(false);
  });
});

/**
 * The guard that keeps two files honest.
 *
 * A model can be routable but unpriced, and that combination is invisible at
 * runtime: `rateFor` falls back to the most expensive Claude rate, so the call
 * works, the money is spent, and the reported cost is quietly fiction. Since
 * the registry and the rate table are separate modules, only a test can hold
 * them together.
 */
describe("registry and pricing agree", () => {
  it("prices every hosted model it is willing to call", () => {
    for (const model of Object.keys(HOSTED_MODEL_PROVIDERS)) {
      expect(isKnownModel(model), `${model} is callable but has no rate in lib/pricing.ts`).toBe(true);
    }
  });

  it("prices local models at zero rather than at the unknown-model fallback", () => {
    // Without this, a free local call would be reported at Sonnet rates — and
    // the whole point of running one is to compare against paid providers.
    expect(rateFor("ollama/llama3.2:3b")).toEqual({ input: 0, output: 0 });
    expect(isKnownModel("ollama/llama3.2:3b")).toBe(true);
  });

  it("still over-states a genuinely unknown model, which the local rule must not weaken", () => {
    expect(rateFor("gemini-2.0-flash")).toEqual(rateFor("claude-sonnet-4-6"));
  });
});
