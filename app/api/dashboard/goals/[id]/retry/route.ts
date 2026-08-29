import { type NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { enforceUsageGate } from "@/lib/usage";
import { generateTrack } from "@/lib/tracker/generate";
import { buildState, retryVerdict } from "@/lib/tracker/buildState";
import { recordOperation } from "@/lib/observability/record";
import { logSafeError } from "@/lib/observability/log";
import { type LearningGoal } from "@/types";

// Rebuild the track for a goal whose build failed or died mid-flight.
//
// Before this existed the only remedy was "remove and re-add", which threw
// away the goal and made the learner re-run the whole Q&A refinement — a
// second Sonnet call for information they had already given. This reuses the
// exact machine the first build used: flip to 'pending', generate in after(),
// settle to 'ready' or 'failed'. The client watches it with the same
// useTrackStatusWatch hook, so there is one state machine, not two.
//
// Mirrors goals/route.ts and document/approve's maxDuration for the same
// reason: the after() work must outlive the response.
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A retry spends a full track-generation call, so it is gated like any
  // other spend. Without this, a failing build would be an unmetered loop.
  const usageGate = await enforceUsageGate(userId);
  if (usageGate) {
    void recordOperation({
      userId, operation: "track.retry", outcome: "refused",
      detail: { reason: "usage-gate" },
    });
    return usageGate;
  }

  const { id: goalId } = await params;
  const supabase = await createClient();

  const { data: goal, error: goalError } = await supabase
    .from("learning_goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();

  if (goalError || !goal) {
    return NextResponse.json({ error: "Goal not found." }, { status: 404 });
  }

  const g = goal as LearningGoal;

  // "Does a usable board already exist?" is part of the decision: a goal can
  // read 'ready' and still have no track, or a track with nothing on it.
  const { data: track } = await supabase
    .from("tracks")
    .select("id")
    .eq("goal_id", goalId)
    .eq("user_id", userId)
    .maybeSingle();

  let milestoneCount = 0;
  if (track) {
    const { count } = await supabase
      .from("milestones")
      .select("id", { count: "exact", head: true })
      .eq("track_id", track.id as string);
    milestoneCount = count ?? 0;
  }

  // The same rule the UI uses to decide whether to show the button. Enforced
  // here too: a client sitting on a stale page must not be able to restart a
  // build that is currently running, which would buy a second Sonnet call for
  // a track that is about to arrive anyway.
  const state   = buildState(g.track_status, g.track_started_at ?? g.created_at, Date.now());
  const verdict = retryVerdict(state, Boolean(track) && milestoneCount > 0);

  if (verdict !== "allow") {
    // Each of the three 409s is the server declining correctly - a stale tab
    // trying to restart a live build, a goal that needs approving, a track
    // that is already fine. The verdict rides along so the panel can show
    // which refusal dominates without a second query.
    void recordOperation({
      userId, operation: "track.retry", outcome: "refused",
      detail: { verdict, state },
    });

    const reason =
      verdict === "still-building"  ? "This track is still building - give it a moment." :
      verdict === "needs-approval"  ? "This goal is waiting for you to approve its topic." :
                                      "This track is fine - there is nothing to rebuild.";
    return NextResponse.json({ error: reason, verdict }, { status: 409 });
  }

  const startedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("learning_goals")
    .update({ track_status: "pending", track_started_at: startedAt })
    .eq("id", goalId)
    .eq("user_id", userId);

  if (updateError) {
    logSafeError("goals/retry pending", updateError, [g.topic]);
    return NextResponse.json({ error: "Could not start the rebuild." }, { status: 500 });
  }

  after(async () => {
    const service   = createServiceClient();
    const rebuiltAt = Date.now();
    try {
      // A previous attempt can leave a track row behind — generateTrack only
      // cleans up its own partial write, and an earlier build may have
      // succeeded at the track row and failed later. Clearing first keeps the
      // goal to one track, so the board never has two to choose between.
      const { error: clearError } = await service
        .from("tracks")
        .delete()
        .eq("goal_id", goalId)
        .eq("user_id", userId);

      if (clearError) {
        throw new Error(`could not clear the previous track: ${clearError.message}`);
      }

      await generateTrack(service, userId, g.topic, goalId);
      await service.from("learning_goals").update({ track_status: "ready" }).eq("id", goalId);
      await recordOperation({
        userId, operation: "track.retry", outcome: "ok",
        durationMs: Date.now() - rebuiltAt, detail: { previousState: state },
      });
    } catch (err) {
      logSafeError("goals/retry background rebuild", err, [g.topic]);
      await service.from("learning_goals").update({ track_status: "failed" }).eq("id", goalId);
      await recordOperation({
        userId, operation: "track.retry", outcome: "failed",
        durationMs: Date.now() - rebuiltAt, error: err, redact: [g.topic],
        detail: { previousState: state },
      });
    }
  });

  return NextResponse.json({
    goal: { ...g, track_status: "pending", track_started_at: startedAt },
  });
}
