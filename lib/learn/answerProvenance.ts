import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { logSafeError } from "@/lib/observability/log";

/**
 * Redact the `track_generations` rows that point at one goal.
 *
 * Two buttons reach this, and migration 048 calls them "the same outcome
 * reached by a different button": deleting the goal, and deleting only the
 * 5-whys answers behind it. Both leave the eval record standing while removing
 * the learner-derived text from it, so this is one implementation rather than
 * two that can drift.
 *
 * What it clears, and why those columns specifically:
 *
 *   input_topic      the topic as actually sent to the generator
 *   milestones_out   the generated board, frozen at generation time
 *
 * Both are derived from what the learner said, and `track_generations` has RLS
 * enabled with no policy — so this is learner-derived text sitting in a table
 * the learner cannot reach, read, or delete for themselves. That is the whole
 * reason a server-side action exists. `milestones_out` is the sharper of the
 * two: a milestone generated from "I have an interview next week" can carry
 * that circumstance in its title, and the learner has no way to see that copy.
 *
 * What it deliberately does NOT clear: `answer_chars`, `context_uptake`,
 * `milestone_count`, `tokens_*`. Those are numbers, frozen at write time, and
 * 048 keeps them precisely so a deletion can remove the words without blinding
 * the eval. A number is not the sentence it came from.
 *
 * `input_intact` goes false in the same statement. Without it the loss is
 * silent: a query would return fewer rows and look complete, and the replay
 * corpus would shrink fastest among the goals learners abandoned or thought
 * better of — quietly selecting for tracks that went well.
 *
 * Service-role, because of the no-policy RLS above.
 */
export interface RedactionResult {
  /** False when the update did not land. Callers decide whether that matters. */
  ok: boolean;
}

/**
 * Never throws. It returns its outcome instead, because the two callers need
 * opposite stances on failure and neither is served by an exception:
 *
 *  - Deleting a GOAL must always be possible. Provenance bookkeeping is not
 *    allowed to be the reason a learner cannot remove something from their
 *    library, so that caller logs the failure and carries on.
 *  - Deleting the ANSWERS is a promise about data. Reporting success while
 *    this failed would tell a learner their words are gone when a copy
 *    remains, so that caller stops and says so.
 */
export async function redactGenerationProvenance(
  goalId: string,
  userId: string,
): Promise<RedactionResult> {
  try {
    const service = createServiceClient();
    const { error } = await service
      .from("track_generations")
      .update({ input_topic: "", milestones_out: null, input_intact: false })
      .eq("goal_id", goalId)
      .eq("user_id", userId);

    if (error) {
      logSafeError("provenance redaction", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logSafeError("provenance redaction", err);
    return { ok: false };
  }
}
