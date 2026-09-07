/**
 * What a screen should do with the reply to a save.
 *
 * Architecture rule 5 says a failure must be distinguishable from a wait. The
 * failure this module exists for is quieter than that, and worse: `fetch`
 * resolves for 401, 403 and 500 exactly as happily as it does for 200 — it only
 * *rejects* when the request never reached a server at all. So a screen that
 * awaits the call and then moves on has not checked anything. It shows a
 * success it never received, and the learner finds out tomorrow when the card
 * is back where it started.
 *
 * The sibling of `recovery.ts`: that one decides what to offer when a screen
 * throws while rendering, this one decides what to offer when a save comes
 * back refused.
 *
 * WHY THE SERVER'S OWN MESSAGE IS NOT USED HERE. The milestone routes answer
 * with developer strings — "Unauthorized", "Invalid column", "No valid fields
 * to update" — written for whoever reads the logs. That is the right register
 * for those routes and the wrong one for a learner who has just passed a quiz.
 * Where a route *does* write learner copy on purpose (`learn/chat` explains a
 * budget refusal in a sentence meant to be read), the screen should show that
 * message instead of this one; the two cases are genuinely different and
 * neither should be made to cover the other.
 *
 * Pure and dependency-free apart from the shared error readers, so the decision
 * is unit-tested rather than buried in four client components (CLAUDE.md
 * rule 7).
 */

import { errorClassOf } from "@/lib/observability/sanitize";

/**
 * Why a save did not happen. Coarser than an HTTP status on purpose: what a
 * screen has to decide is whether to offer the button again, and these are the
 * distinctions that change that answer.
 */
export type SaveFailureReason =
  | "signed-out"   // 401 — the session lapsed; the commonest real cause
  | "not-found"    // 403/404 — not this learner's row, or gone
  | "rejected"     // other 4xx — the server understood and declined
  | "busy"         // 429/503 — temporary, by the server's own account
  | "server"       // 5xx and anything unexpected — Hugh's fault
  | "unreachable"; // the request never arrived: no network, DNS, CORS

export interface SaveFailure {
  reason: SaveFailureReason;
  /** One sentence for the learner. Says what happened, never what the code did. */
  message: string;
  /**
   * Whether pressing the same button again could plausibly work. A retry that
   * cannot succeed is itself a failure disguised as a wait, which is the thing
   * rule 5 forbids — so "sign in again" must not be offered as "try again".
   */
  canRetry: boolean;
}

export type SaveOutcome = { ok: true } | ({ ok: false } & SaveFailure);

/**
 * The copy, in one place. Every line names the save that did not happen, so a
 * screen can show it without having to add "…and this wasn't saved" itself.
 */
const FAILURES: Record<SaveFailureReason, Omit<SaveFailure, "reason">> = {
  "signed-out": {
    message:  "You've been signed out, so this wasn't saved. Sign in again and it will save.",
    canRetry: false,
  },
  "not-found": {
    message:  "We couldn't find this card on your account, so nothing was saved. Go back to your board and open it again.",
    canRetry: false,
  },
  rejected: {
    message:  "Hugh wouldn't accept that change, so nothing was saved.",
    canRetry: false,
  },
  busy: {
    message:  "Hugh is busy and didn't save this. Give it a moment and try again.",
    canRetry: true,
  },
  server: {
    message:  "Something went wrong on Hugh's side, so this wasn't saved. Try again.",
    canRetry: true,
  },
  unreachable: {
    message:  "We couldn't reach Hugh, so this wasn't saved. Check your connection and try again.",
    canRetry: true,
  },
};

function failure(reason: SaveFailureReason): SaveOutcome {
  return { ok: false, reason, ...FAILURES[reason] };
}

/**
 * Read an HTTP status the way a screen needs to read it.
 *
 * Anything outside 2xx is a save that did not happen — including the 1xx and
 * 3xx a `fetch` should never surface, which land in "server" because an
 * unexplained reply is Hugh's problem, not the learner's.
 */
export function outcomeOfStatus(status: number): SaveOutcome {
  if (status >= 200 && status < 300) return { ok: true };

  if (status === 401) return failure("signed-out");
  if (status === 403 || status === 404) return failure("not-found");
  if (status === 429 || status === 503) return failure("busy");
  if (status >= 400 && status < 500) return failure("rejected");

  return failure("server");
}

/**
 * Read a thrown error from a `fetch` call.
 *
 * The browser throws `TypeError` when the request never reached a server —
 * offline, DNS, a blocked or aborted connection. Anything else thrown at a save
 * site came from our own code after the reply arrived (a `res.json()` on a
 * response that wasn't JSON, say), which is Hugh's fault rather than the
 * connection's, and reads better as such.
 */
export function outcomeOfThrown(error: unknown): SaveOutcome {
  return errorClassOf(error) === "TypeError"
    ? failure("unreachable")
    : failure("server");
}

/**
 * Swap in the server's own sentence, where the server wrote one to be read.
 *
 * The header above explains why this module supplies the copy: the milestone
 * routes answer with log shorthand. But one of them does not, all the way
 * through. `milestones/[id]/summary` refuses with "Add a diary entry before
 * generating a summary" (422), "Milestone is not mastered" (409) and "Summary
 * is too long" (413) — reasons written for a learner, and each one strictly
 * more useful than "Hugh wouldn't accept that change".
 *
 * So this is the opt-in escape hatch, applied per call site rather than
 * guessed at per status code: a screen that knows its route writes learner
 * copy for a given refusal passes that copy in, and everything else keeps
 * ours. `canRetry` is untouched — the server supplies the sentence, never the
 * verdict on whether pressing the button again could work.
 *
 * A blank or missing message falls through to ours, so a route that answers
 * `{}` cannot produce an empty red banner.
 */
export function withServerMessage(
  outcome: SaveOutcome,
  message: string | null | undefined,
): SaveOutcome {
  if (outcome.ok) return outcome;
  const trimmed = message?.trim();
  return trimmed ? { ...outcome, message: trimmed } : outcome;
}
