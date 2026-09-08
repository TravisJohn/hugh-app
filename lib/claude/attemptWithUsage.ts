/**
 * Retry a Claude call without losing what the failed tries cost.
 *
 * Anthropic bills the moment it answers. Whether the answer then parses, is
 * empty, or is thrown away by a retry is our problem, not theirs — so a route
 * that only records the cost of the attempt it liked is under-reporting real
 * money. CLAUDE.md says this outright: "Retry loops accumulate tokens across
 * attempts — a discarded attempt still costs money and must still be logged."
 *
 * The trap this exists to close is the ordering *inside* one attempt. A loop
 * whose body is `call → parse → return` bills on the first line and can throw
 * on the second, so a helper that only collects usage from attempts that
 * succeeded loses exactly the money it was written to protect. Here the caller
 * is handed a `report` function and is expected to call it the instant the model
 * answers; whatever has been reported survives the throw and comes back on the
 * failure path too.
 *
 * Pure apart from the work it is given: the call itself is injected, so the
 * accounting can be tested without a network or an API key (CLAUDE.md rule 7).
 */

export interface AttemptUsage {
  tokensIn:  number;
  tokensOut: number;
}

export type AttemptOutcome<T> =
  | { ok: true;  value: T;          attempts: number; usage: AttemptUsage }
  | { ok: false; error: unknown;    attempts: number; usage: AttemptUsage };

const NO_USAGE: AttemptUsage = { tokensIn: 0, tokensOut: 0 };

/**
 * Run `work` up to `maxAttempts` times, returning the first success.
 *
 * `work` is given a `report` callback and must call it as soon as the model
 * replies, before doing anything that could fail. Usage is summed across every
 * attempt that reported, and is returned whether the whole thing succeeded or
 * not — the failure branch is the one that matters, because that is the branch
 * where the money used to disappear.
 *
 * `maxAttempts` below 1 runs once: refusing to call at all would turn a
 * mis-configured retry count into a silently dead feature, which is a worse
 * failure than one extra attempt.
 */
export async function attemptWithUsage<T>(
  maxAttempts: number,
  work: (report: (usage: AttemptUsage) => void) => Promise<T>,
): Promise<AttemptOutcome<T>> {
  const limit = Math.max(1, Math.floor(maxAttempts));

  let tokensIn  = 0;
  let tokensOut = 0;
  let lastError: unknown = null;

  const report = (usage: AttemptUsage) => {
    tokensIn  += usage.tokensIn;
    tokensOut += usage.tokensOut;
  };

  for (let attempt = 1; attempt <= limit; attempt++) {
    try {
      const value = await work(report);
      return { ok: true, value, attempts: attempt, usage: { tokensIn, tokensOut } };
    } catch (err) {
      lastError = err;
    }
  }

  return {
    ok:       false,
    error:    lastError ?? new Error("the call failed and reported no error"),
    attempts: limit,
    usage:    { tokensIn, tokensOut },
  };
}

/** Whether anything was actually billed. Nothing spent, nothing to log. */
export function wasBilled(usage: AttemptUsage): boolean {
  return usage.tokensIn > 0 || usage.tokensOut > 0;
}

export { NO_USAGE };
