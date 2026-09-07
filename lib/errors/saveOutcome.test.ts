import { describe, it, expect } from "vitest";
import {
  outcomeOfStatus,
  outcomeOfThrown,
  type SaveFailureReason,
} from "./saveOutcome";

/**
 * One outcome per reason, so the copy sweep below cannot silently miss a
 * reason that gets added later — the `Record` type makes an omission a
 * compile error rather than an untested string.
 */
const OUTCOME_FOR: Record<SaveFailureReason, ReturnType<typeof outcomeOfStatus>> = {
  "signed-out": outcomeOfStatus(401),
  "not-found":  outcomeOfStatus(404),
  rejected:     outcomeOfStatus(422),
  busy:         outcomeOfStatus(429),
  server:       outcomeOfStatus(500),
  unreachable:  outcomeOfThrown(new TypeError("Failed to fetch")),
};

/** Narrowing helper — every assertion below is about the failure branch. */
function failureOf(outcome: ReturnType<typeof outcomeOfStatus>) {
  if (outcome.ok) throw new Error("expected a failure, got ok");
  return outcome;
}

describe("outcomeOfStatus — did the save actually happen", () => {
  it("treats every 2xx as saved, including the 204 a PATCH may answer with", () => {
    for (const status of [200, 201, 202, 204, 299]) {
      expect(outcomeOfStatus(status)).toEqual({ ok: true });
    }
  });

  // The bug this module exists for. `fetch` resolves for a 401, so a screen
  // that does not read the status shows a celebration for a refused save.
  it("reports an expired session as a failure rather than a success", () => {
    const outcome = outcomeOfStatus(401);
    expect(outcome.ok).toBe(false);
    expect(failureOf(outcome).reason).toBe("signed-out");
  });

  it("separates a refused save from a missing one, because the way out differs", () => {
    expect(failureOf(outcomeOfStatus(401)).reason).toBe("signed-out");
    expect(failureOf(outcomeOfStatus(403)).reason).toBe("not-found");
    expect(failureOf(outcomeOfStatus(404)).reason).toBe("not-found");
  });

  it("classifies a declined-but-understood request as rejected", () => {
    for (const status of [400, 409, 422]) {
      expect(failureOf(outcomeOfStatus(status)).reason).toBe("rejected");
    }
  });

  it("classifies the server's own 'come back later' answers as busy", () => {
    expect(failureOf(outcomeOfStatus(429)).reason).toBe("busy");
    expect(failureOf(outcomeOfStatus(503)).reason).toBe("busy");
  });

  it("classifies a broken server as Hugh's fault", () => {
    for (const status of [500, 502, 504]) {
      expect(failureOf(outcomeOfStatus(status)).reason).toBe("server");
    }
  });

  it("treats a reply nobody expected as Hugh's fault, never as saved", () => {
    for (const status of [0, 100, 301, 302, 599, 999]) {
      const outcome = outcomeOfStatus(status);
      expect(outcome.ok).toBe(false);
      expect(failureOf(outcome).reason).toBe("server");
    }
  });
});

describe("canRetry — never offer a button that cannot work", () => {
  it("offers a retry only where trying again could plausibly succeed", () => {
    expect(failureOf(outcomeOfStatus(429)).canRetry).toBe(true);
    expect(failureOf(outcomeOfStatus(500)).canRetry).toBe(true);
  });

  // Offering "try again" to someone who has been signed out sends them round a
  // loop that cannot end — a failure disguised as a wait, which is rule 5's
  // whole subject.
  it("withholds the retry when the learner has to do something else first", () => {
    expect(failureOf(outcomeOfStatus(401)).canRetry).toBe(false);
    expect(failureOf(outcomeOfStatus(404)).canRetry).toBe(false);
    expect(failureOf(outcomeOfStatus(422)).canRetry).toBe(false);
  });
});

describe("outcomeOfThrown — the request never arrived", () => {
  it("reads a dropped connection as unreachable, and lets the learner retry", () => {
    // What a browser throws from fetch() with no network.
    const outcome = failureOf(outcomeOfThrown(new TypeError("Failed to fetch")));
    expect(outcome.reason).toBe("unreachable");
    expect(outcome.canRetry).toBe(true);
  });

  it("blames Hugh, not the connection, when our own code threw after the reply", () => {
    const outcome = failureOf(outcomeOfThrown(new SyntaxError("Unexpected token < in JSON")));
    expect(outcome.reason).toBe("server");
  });

  it("still produces a usable answer for something thrown that isn't an Error", () => {
    for (const thrown of [undefined, null, "boom", 42, {}]) {
      const outcome = outcomeOfThrown(thrown);
      expect(outcome.ok).toBe(false);
      expect(failureOf(outcome).message).not.toBe("");
    }
  });
});

describe("the copy a learner actually reads", () => {
  it("gives every reason a sentence, and says in each that nothing was saved", () => {
    for (const [reason, raw] of Object.entries(OUTCOME_FOR)) {
      const outcome = failureOf(raw);
      expect(outcome.reason, `reason key ${reason}`).toBe(reason);
      expect(outcome.message.length).toBeGreaterThan(20);
      expect(outcome.message).toMatch(/\.$/);
      expect(outcome.message.toLowerCase()).toMatch(/wasn't saved|nothing was saved|didn't save/);
    }
  });

  // A learner should never be shown a status code, a stack, or the word
  // "error" standing in for an explanation.
  it("never puts a status code or developer wording in front of a learner", () => {
    for (const status of [401, 403, 422, 429, 500, 302]) {
      const { message } = failureOf(outcomeOfStatus(status));
      expect(message).not.toMatch(/\d{3}/);
      expect(message.toLowerCase()).not.toMatch(/error|null|undefined|fetch|http|unauthorized/);
    }
  });
});
