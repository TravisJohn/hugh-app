/**
 * What a learner should be offered when a screen throws.
 *
 * Architecture rule 5 says a failure needs its own copy and its own way out —
 * and the way out has to actually work. React's `reset()` re-renders the same
 * tree, which is the right move for a transient failure (a dropped query, a
 * flaky fetch) and the *wrong* one after a deploy: the browser is holding a
 * stale chunk manifest, so re-rendering re-requests the same missing chunk and
 * throws again. A retry button that cannot succeed is a failure disguised as a
 * wait, which is the exact thing rule 5 forbids.
 *
 * Pure and dependency-free apart from the shared error readers, so the decision
 * is unit-tested rather than buried in a client component (CLAUDE.md rule 7).
 */

import { errorClassOf, messageOf } from "@/lib/observability/sanitize";

/** `retry` re-renders in place; `reload` fetches the document again. */
export type RecoveryAction = "retry" | "reload";

export interface Recovery {
  action: RecoveryAction;
  /**
   * Next's error digest — the only handle on a failure once production has
   * redacted the message. Shown so a learner can quote it in an email.
   */
  reference: string | null;
}

/** Thrown by webpack/Turbopack when a chunk referenced by stale HTML is gone. */
const STALE_DEPLOY_CLASSES = new Set(["ChunkLoadError"]);

/**
 * Message shapes for the same condition. Matched as well as the class because
 * the wrapping differs by bundler, browser and whether the import was dynamic.
 */
const STALE_DEPLOY_MESSAGES = [
  /loading chunk \S+ failed/i,
  /loading css chunk/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
];

/**
 * Next reserves `NEXT_`-prefixed digests for control flow — `notFound()` and
 * `redirect()` throw to unwind the render. They should never surface here, and
 * if one does it is not a reference a human can do anything with.
 */
const CONTROL_FLOW_DIGEST = /^NEXT_/;

export function isStaleDeploy(error: unknown): boolean {
  if (STALE_DEPLOY_CLASSES.has(errorClassOf(error))) return true;

  const message = messageOf(error);
  return STALE_DEPLOY_MESSAGES.some(pattern => pattern.test(message));
}

export function referenceOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;

  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return null;

  const trimmed = digest.trim();
  if (!trimmed || CONTROL_FLOW_DIGEST.test(trimmed)) return null;

  return trimmed;
}

export function recoveryFor(error: unknown): Recovery {
  return {
    action:    isStaleDeploy(error) ? "reload" : "retry",
    reference: referenceOf(error),
  };
}
