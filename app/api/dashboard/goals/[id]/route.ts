import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { logSafeError } from "@/lib/observability/log";

/**
 * Redact the provenance rows that point at a goal about to be deleted.
 *
 * `goal_answers` cascades on its own, but `track_generations` does not: its
 * `goal_id` is ON DELETE SET NULL so the eval record survives de-identified.
 * That leaves two columns of learner-derived text — `input_topic` and
 * `milestones_out` — in a table the learner cannot reach, which is exactly what
 * migration 048 says a delete has to clear.
 *
 * `input_intact` goes false in the same statement. Without it the loss is
 * silent: a query would return fewer rows and look complete, and the replay
 * corpus would shrink fastest among the goals learners abandoned — quietly
 * selecting for tracks that went well.
 *
 * Runs BEFORE the goal is deleted, because afterwards `goal_id` is null and
 * these rows can no longer be found. If the delete then fails, the worst case
 * is a goal that survives having lost its eval text — the safe direction.
 *
 * Service-role, because `track_generations` has RLS enabled and no policy.
 * Never throws: this must not be the reason a learner cannot delete a goal.
 */
async function redactGenerationProvenance(goalId: string, userId: string): Promise<void> {
  try {
    const service = createServiceClient();
    const { error } = await service
      .from("track_generations")
      .update({ input_topic: "", milestones_out: null, input_intact: false })
      .eq("goal_id", goalId)
      .eq("user_id", userId);

    if (error) logSafeError("goals/delete provenance", error);
  } catch (err) {
    logSafeError("goals/delete provenance", err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  // Ownership is enforced by the delete's own user_id filter below, but the
  // redaction runs first and needs the same guarantee, so it is checked here
  // rather than inferred.
  const { data: goal } = await supabase
    .from("learning_goals")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Goal not found." }, { status: 404 });

  await redactGenerationProvenance(id, userId);

  const { error } = await supabase
    .from("learning_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    logSafeError("goals/delete", error);
    return NextResponse.json({ error: "Could not delete goal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
