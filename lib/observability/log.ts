import { sanitize, errorClassOf } from "./sanitize";

/**
 * Console logging that cannot leak what a learner typed.
 *
 * `operation_events` is carefully defended — explicit redaction lists, a
 * 40-character ceiling on detail values, a 200-character cap on error notes,
 * and the reasoning for all of it written down in sanitize.ts. The server
 * console never got the same treatment, and it is not a lesser store: these
 * lines go to Vercel's log drain, which is retained, searchable, and readable
 * by anyone with project access.
 *
 * Two things were reaching it. `console.error("...", err)` on a failed model
 * call prints whatever the SDK threw, and an API error can quote the request it
 * rejected — a request whose body held the learner's topic and, on the refine
 * route, all five of their free-text answers about their job and motivation.
 * And one call site logged 500 characters of raw model output directly.
 *
 * So the rule is the same as for telemetry: log the error's class and a
 * redacted, truncated message, never the error object, never a stack, never
 * model output. The caller passes the learner-supplied strings it has in hand,
 * because the caller is the only thing that reliably knows which those are.
 *
 * Deliberately not `import "server-only"`: this is a plain wrapper over pure
 * functions, and marking it server-only would stop the pure sanitizer tests
 * from importing anything that touches it.
 */
export function logSafeError(
  scope:   string,
  err:     unknown,
  secrets: readonly string[] = [],
): void {
  console.error(`[${scope}] ${errorClassOf(err)}: ${sanitize(err, secrets)}`);
}

/**
 * The same, at warning level, for conditions that are odd but not failures.
 *
 * Takes a plain message rather than a thrown value — the call sites that need
 * this are reporting something they observed, not something that threw.
 */
export function logSafeWarning(
  scope:   string,
  message: string,
  secrets: readonly string[] = [],
): void {
  console.warn(`[${scope}] ${sanitize(new Error(message), secrets)}`);
}
