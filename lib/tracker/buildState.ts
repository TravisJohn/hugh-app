import { type TrackStatus } from "@/types";

// How long a build may sit at 'pending' before we stop believing in it.
// `after()` work can be killed by the platform without ever writing a final
// status, so 'pending' is not self-limiting — something has to call it.
// Five minutes is comfortably past the observed 30-90s build.
export const STALL_MS = 5 * 60 * 1000;

// What the learner is actually looking at. Distinct from TrackStatus because
// 'pending' means two different things depending on how long it has been
// pending, and because only this vocabulary answers "can they retry?".
export type BuildState =
  | "ready"
  | "building"
  | "stalled"
  | "failed"
  | "awaiting_approval";

/**
 * Resolve a goal's stored status into what the UI should say about it.
 *
 * `startedAtIso` should be `track_started_at ?? created_at` — the fallback
 * covers rows written before migration 046. A null/unparseable timestamp is
 * treated as "just started" rather than "stalled": guessing stalled would
 * offer a retry over a build that may still be running, and running it twice
 * costs a second Sonnet call.
 */
export function buildState(
  status:       TrackStatus,
  startedAtIso: string | null | undefined,
  now:          number,
): BuildState {
  if (status !== "pending") return status;

  if (!startedAtIso) return "building";
  const startedAt = new Date(startedAtIso).getTime();
  if (Number.isNaN(startedAt)) return "building";

  return now - startedAt > STALL_MS ? "stalled" : "building";
}

/**
 * Retry is offered exactly where refreshing cannot help. 'building' still
 * might finish on its own; 'ready' has nothing to fix; 'awaiting_approval'
 * needs the learner to approve a topic, not to rebuild.
 */
export function canRetry(state: BuildState): boolean {
  return state === "failed" || state === "stalled";
}

/**
 * Server-side guard for the retry route. Takes the raw row values so the
 * route does not have to duplicate the fallback rule above.
 */
export function isRetryable(
  status:       TrackStatus,
  startedAtIso: string | null | undefined,
  createdAtIso: string,
  now:          number,
): boolean {
  return canRetry(buildState(status, startedAtIso ?? createdAtIso, now));
}

// What the track page should render. A goal can be 'ready' and still have no
// usable board: legacy goals predate track linking, and a track whose
// milestone insert failed under the old unchecked code is 'ready' with an
// empty board. Both are broken, not building.
export type TrackViewState = "board" | "building" | "broken";

export function trackViewState(
  state:          BuildState,
  hasTrack:       boolean,
  milestoneCount: number,
): TrackViewState {
  if (hasTrack && milestoneCount > 0) return "board";
  if (state === "building") return "building";
  return "broken";
}

// Why a retry was refused, so the route can say something true rather than a
// generic 409. Shared with the UI so the button is offered exactly where the
// server would accept it.
export type RetryVerdict = "allow" | "still-building" | "needs-approval" | "nothing-wrong";

export function retryVerdict(state: BuildState, hasUsableTrack: boolean): RetryVerdict {
  if (state === "building")          return "still-building";
  if (state === "awaiting_approval") return "needs-approval";
  if (state === "failed" || state === "stalled") return "allow";
  // 'ready' is only genuinely fine if there is a board behind it. This branch
  // is the one that guards learner data: a retry deletes the track row, and
  // the diary and point history cascade off it, so answering "allow" for a
  // healthy track would destroy work the learner cannot get back. The
  // fallthrough is safe only because an empty board has nothing to lose.
  return hasUsableTrack ? "nothing-wrong" : "allow";
}
