import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { logSafeError } from "@/lib/observability/log";
import { recordOperation } from "@/lib/observability/record";
import { redactGenerationProvenance } from "@/lib/learn/answerProvenance";
import { type StoredAnswer } from "@/types";

// ── The learner's own copy of what they told Hugh ───────────────────────────
//
// Migration 048 started keeping the 5-whys answers. Before it they were read
// once to produce a 5-10 word refined title and then discarded, which was
// unintentionally the strongest privacy posture in the product. Keeping them
// is what makes "does context produce a better track?" answerable, and this
// route is the other half of that bargain: the learner can read back exactly
// what is stored, and remove it, without giving up the goal or the track it
// produced.
//
// Deliberately separate from the goal DELETE next door. Withdrawing what you
// said and abandoning what you are learning are different intentions, and
// making the learner destroy a track to retract a sentence would be a reason
// not to answer honestly in the first place.
//
// Spends no tokens: there is no model call on either verb, so there is no
// `logUsage` and no usage gate. A privacy control must not be rationed.

/** Both verbs need the same answer: is this goal actually theirs? */
async function ownsGoal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  goalId:   string,
  userId:   string,
): Promise<boolean> {
  const { data } = await supabase
    .from("learning_goals")
    .select("id")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: goalId } = await params;
  const supabase = await createClient();

  if (!(await ownsGoal(supabase, goalId, userId))) {
    return NextResponse.json({ error: "Goal not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("goal_answers")
    .select("position, question, answer")
    .eq("goal_id", goalId)
    .eq("user_id", userId)
    .order("position", { ascending: true });

  // "Nothing is stored" and "we could not read it" are different sentences to
  // the person asking what you hold on them, and on this screen the difference
  // is the whole point. Never let a dropped query render as an empty list.
  if (error) {
    logSafeError("goals/answers read", error);
    return NextResponse.json({ error: "Could not read your answers." }, { status: 500 });
  }

  return NextResponse.json({ answers: (data ?? []) as StoredAnswer[] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: goalId } = await params;
  const supabase = await createClient();

  if (!(await ownsGoal(supabase, goalId, userId))) {
    return NextResponse.json({ error: "Goal not found." }, { status: 404 });
  }

  // Redaction FIRST, and it is allowed to abort the whole thing.
  //
  // `goal_answers` holds the sentences; `track_generations` holds text derived
  // from them in a table the learner cannot reach. Deleting the reachable copy
  // while the unreachable one survived would be the worst possible outcome —
  // the learner is told their words are gone, and a copy remains where they
  // can never find it. Failing here changes nothing, so a retry is clean.
  //
  // This is the opposite stance to the goal DELETE route, which logs the same
  // failure and proceeds. There, provenance must not block a learner removing
  // a goal. Here, the redaction IS what was promised.
  const redaction = await redactGenerationProvenance(goalId, userId);
  if (!redaction.ok) {
    void recordOperation({
      userId, operation: "answers.forget", outcome: "failed",
      detail: { stage: "redact" },
    });
    return NextResponse.json(
      { error: "Your answers were not deleted — nothing was changed. Please try again." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("goal_answers")
    .delete()
    .eq("goal_id", goalId)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    logSafeError("goals/answers delete", error);
    void recordOperation({
      userId, operation: "answers.forget", outcome: "failed",
      error, detail: { stage: "answers" },
    });
    return NextResponse.json(
      { error: "Your answers could not be deleted. Please try again." },
      { status: 500 },
    );
  }

  // No topic, no question text, no answer text — the count only. A row saying
  // WHAT a learner retracted would defeat the deletion it is recording.
  void recordOperation({
    userId, operation: "answers.forget", outcome: "ok",
    detail: { deleted: data?.length ?? 0 },
  });

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
