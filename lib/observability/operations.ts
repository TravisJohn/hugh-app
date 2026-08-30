// ── The operation registry ──────────────────────────────────────────────────
//
// An "operation" is one attempt at something the system does on a learner's
// behalf: build a track, judge a topic, generate a quiz. `operation_events`
// records one row per attempt, answering "did it work, how long, and why not".
//
// THIS IS NOT `usage_logs` AND NOT `activity_events`. Those record spend and
// engagement respectively, at grains that cannot carry an outcome:
// `usage_logs` is priced per row, so non-spend rows corrupt the cost maths;
// `activity_events` is deduped to one row per learner per surface per day, so
// it cannot hold per-attempt anything. See PRD-observability.md §3.
//
// This registry is the single source of truth for the vocabulary. Nothing
// writes an operation id that is not here, and the admin panel iterates THIS
// rather than the table — so an orphaned id renders nowhere instead of
// corrupting a view. Adding an operation is a TypeScript change, deliberately
// not a migration, for the same reason `activity_events.feature` has no CHECK
// constraint.
//
// Pure: no React, no Supabase, no `server-only`.

/**
 * What happened. Three values, not two, and `refused` is the load-bearing one.
 *
 * A usage-gate block, an off-domain topic, a 409 "still building" — these are
 * the system working correctly. Folding them into `failed` would make a
 * healthy product look broken and send the operator chasing noise.
 */
export type OperationOutcome = "ok" | "failed" | "refused";

export const OPERATION_OUTCOMES: readonly OperationOutcome[] = [
  "ok",
  "failed",
  "refused",
] as const;

/** The v1 vocabulary. Ids are `domain.action` and are stored as database keys. */
export type OperationId =
  | "track.build"
  | "track.retry"
  | "topic.gate"
  | "quiz.generate"
  | "mastery.evaluate"
  | "ask.chat"
  | "answers.forget";

/**
 * The prefix half of an id. Kept as its own type so a later surface joins as
 * `code.drill` or `notes.coach` without renaming anything that exists.
 */
export type OperationDomain =
  | "track" | "topic" | "quiz" | "mastery" | "ask" | "answers";

export interface OperationDefinition {
  /** Stored in `operation_events.operation`. Stable — changing one orphans history. */
  id:     OperationId;
  /** Always the segment before the dot in `id`; asserted in the tests. */
  domain: OperationDomain;
  label:  string;

  /**
   * Whether the browser may report this operation through the beacon route.
   *
   * The beacon is a client-writable path into a system table, so it is a
   * fixed-shape signal rather than a logging endpoint. Only `track.build`
   * qualifies: `useTrackStatusWatch`'s hard timeout is the sole evidence that
   * an `after()` invocation was killed before it wrote any status, and only
   * the browser ever learns that happened.
   */
  clientReportable: boolean;

  /**
   * When this operation fails, does the learner find out?
   *
   * `topic.gate` fails OPEN by design — a classifier outage returns
   * "in domain" and the request proceeds normally. Nobody sees a failure, so
   * a gate that has stopped gating looks exactly like one that is working.
   * That is the failure this whole system exists to surface, and it is why
   * the flag is on the record rather than left as tribal knowledge.
   */
  failureIsSilent: boolean;

  /** Why this operation is worth a row. Read by whoever adds the next one. */
  description: string;
}

/**
 * Order follows the learner's path through the loop: get a track, recover a
 * broken one, be let in or turned away, then study, prove, and ask. Not
 * alphabetical — that would separate the two halves of track building.
 */
export const OPERATIONS: readonly OperationDefinition[] = [
  {
    id:               "track.build",
    domain:           "track",
    label:            "Build track",
    clientReportable: true,
    failureIsSilent:  false,
    description:
      "Generating a track's milestones, from either the Q&A path or an " +
      "uploaded document. Runs in after(), so it can be killed without ever " +
      "writing a status — the case the client beacon exists to catch.",
  },
  {
    id:               "track.retry",
    domain:           "track",
    label:            "Rebuild track",
    clientReportable: false,
    failureIsSilent:  false,
    description:
      "A learner-triggered rebuild of a failed or stalled track. Refusals " +
      "here are the three 409 verdicts, which are the system declining " +
      "correctly rather than breaking.",
  },
  {
    id:               "topic.gate",
    domain:           "topic",
    label:            "Topic domain gate",
    clientReportable: false,
    failureIsSilent:  true,
    description:
      "Judging whether a topic is inside Hugh's data and analytics domain. " +
      "Off-domain is 'refused'. A classifier outage is 'failed' even though " +
      "the request succeeds, because the gate silently stopped gating.",
  },
  {
    id:               "quiz.generate",
    domain:           "quiz",
    label:            "Generate review quiz",
    clientReportable: false,
    failureIsSilent:  false,
    description:
      "Building a diary-grounded review quiz for a milestone.",
  },
  {
    id:               "mastery.evaluate",
    domain:           "mastery",
    label:            "Evaluate mastery",
    clientReportable: false,
    failureIsSilent:  false,
    description:
      "Scoring a learner's spoken mastery attempt.",
  },
  {
    id:               "ask.chat",
    domain:           "ask",
    label:            "Ask Hugh",
    clientReportable: false,
    failureIsSilent:  false,
    description:
      "One tutor-chat exchange. The highest-volume operation by a wide " +
      "margin, and the first candidate to drop if the table gets noisy.",
  },
  {
    id:               "answers.forget",
    domain:           "answers",
    label:            "Delete 5-whys answers",
    clientReportable: false,
    failureIsSilent:  false,
    description:
      "A learner retracting the 5-whys answers behind one goal. The only " +
      "operation here that spends nothing and is purely about data the " +
      "learner owns, which is exactly why it needs a row: a deletion that " +
      "half-succeeded leaves derived text in a table they cannot reach, and " +
      "the count is the only evidence it ran at all. The row records how " +
      "many rows went, never what they said.",
  },
] as const;

export const OPERATION_IDS: readonly OperationId[] = OPERATIONS.map(o => o.id);

/** The only operations the beacon route will accept from a browser. */
export const CLIENT_REPORTABLE_IDS: readonly OperationId[] = OPERATIONS
  .filter(o => o.clientReportable)
  .map(o => o.id);

/** Operations whose failure the learner never sees. Ranked first in the panel. */
export const SILENT_FAILURE_IDS: readonly OperationId[] = OPERATIONS
  .filter(o => o.failureIsSilent)
  .map(o => o.id);

export function isOperationId(value: unknown): value is OperationId {
  return typeof value === "string" && (OPERATION_IDS as readonly string[]).includes(value);
}

export function isOperationOutcome(value: unknown): value is OperationOutcome {
  return typeof value === "string" && (OPERATION_OUTCOMES as readonly string[]).includes(value);
}

/** Null rather than a throw: an unknown id is a rendering decision, not a crash. */
export function operationById(id: string): OperationDefinition | null {
  return OPERATIONS.find(o => o.id === id) ?? null;
}
