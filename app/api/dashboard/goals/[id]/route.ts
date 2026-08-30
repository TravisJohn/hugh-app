import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { logSafeError } from "@/lib/observability/log";
import { redactGenerationProvenance } from "@/lib/learn/answerProvenance";

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

  // Best effort, deliberately. `redactGenerationProvenance` reports failure
  // rather than throwing, and here that report is logged and ignored:
  // provenance bookkeeping must never be the reason a learner cannot remove a
  // goal from their library. The answers-only route takes the opposite stance
  // on the same call, because there the redaction IS the promise.
  //
  // Runs BEFORE the delete, because afterwards `track_generations.goal_id` is
  // null (ON DELETE SET NULL) and these rows can no longer be found. If the
  // delete then fails, the worst case is a goal that survives having lost its
  // eval text — the safe direction.
  const redaction = await redactGenerationProvenance(id, userId);
  if (!redaction.ok) logSafeError("goals/delete provenance", "redaction did not land");

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
