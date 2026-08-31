import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidPointTag } from "@/lib/tracker/points";
import { sanitizeCovered, sanitizeTranscript } from "@/lib/learn/sessionRecord";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    topic:        string;
    story:        string;
    takeaway:     string;
    title?:       string;
    goalId?:      string;
    milestoneId?: string;
    pointId?:     string | null;
    covered?:     unknown;
    transcript?:  unknown;
  };

  const { topic, story, takeaway, title, goalId, milestoneId, pointId } = body;
  if (!topic || !story || !takeaway) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const entryTitle = title?.trim() || topic;
  const entryBody  = `${story}\n\nKey Takeaway: ${takeaway}`;

  // Both arrive from the browser, so both are re-validated here rather than
  // trusted from the summarize response they originally came from.
  const covered    = sanitizeCovered(body.covered);
  const transcript = sanitizeTranscript(body.transcript);

  // ── Case 1: milestone-scoped session → save as a diary entry on that card ──
  if (milestoneId) {
    const { data: ms } = await supabase
      .from("milestones")
      .select("id")
      .eq("id", milestoneId)
      .single();

    if (!ms) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

    // A tag pointing at a non-existent learning point is dropped rather than rejected.
    const tag = (await isValidPointTag(supabase, milestoneId, pointId)) ? pointId ?? null : null;

    const { error: entryError } = await supabase
      .from("milestone_entries")
      .insert({
        milestone_id: milestoneId,
        user_id:      user.id,
        title:        entryTitle,
        body:         entryBody,
        point_id:     tag,
        covered,
        transcript,
      });

    if (entryError) {
      return NextResponse.json({ error: "Failed to save diary entry" }, { status: 500 });
    }

    return NextResponse.json({ milestoneId, saved: true });
  }

  // ── Case 2: a goal-scoped session with no card → a new card on that track ──
  //
  // This used to CREATE a track, with no `goal_id` on it. That was the last
  // path in the product that put a `tracks` row into the world outside the
  // build state machine, and what it produced could not be reached: the board
  // page finds a track by its goal, so a track without one has no URL. Eleven
  // such tracks exist, holding 134 milestones nobody can open.
  //
  // It now attaches the session to the track the learner is already studying,
  // which is what they were doing anyway. `goalId` is required to get here:
  // without a card AND without a goal there is no track this belongs to, and
  // inventing one is exactly the bug. That combination was only reachable from
  // `/learn`, which has been deleted.
  if (!goalId) {
    return NextResponse.json(
      { error: "This session is not attached to a goal, so there is nowhere to save it." },
      { status: 400 },
    );
  }

  const { data: track } = await supabase
    .from("tracks")
    .select("id")
    .eq("goal_id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!track) {
    return NextResponse.json({ error: "That goal has no track to save into." }, { status: 404 });
  }

  const trackId = track.id as string;

  // Appended to the end of the backlog rather than position 0, which would put
  // a session note ahead of the curriculum's own first milestone.
  const { count: existing } = await supabase
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .eq("track_id", trackId);

  const { data: milestone, error: milestoneError } = await supabase
    .from("milestones")
    .insert({
      track_id:      trackId,
      title:         entryTitle,
      summary:       entryBody,
      kanban_column: "learn",
      position:      existing ?? 0,
    })
    .select("id")
    .single();

  if (milestoneError || !milestone) {
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }

  return NextResponse.json({ milestoneId: milestone.id, trackId, saved: true });
}
