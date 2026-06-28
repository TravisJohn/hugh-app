import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidPointTag } from "@/lib/tracker/points";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    topic:        string;
    story:        string;
    takeaway:     string;
    title?:       string;
    milestoneId?: string;
    pointId?:     string | null;
  };

  const { topic, story, takeaway, title, milestoneId, pointId } = body;
  if (!topic || !story || !takeaway) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const entryTitle = title?.trim() || topic;
  const entryBody  = `${story}\n\nKey Takeaway: ${takeaway}`;

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
      .insert({ milestone_id: milestoneId, user_id: user.id, title: entryTitle, body: entryBody, point_id: tag });

    if (entryError) {
      return NextResponse.json({ error: "Failed to save diary entry" }, { status: 500 });
    }

    return NextResponse.json({ milestoneId, saved: true });
  }

  // ── Case 2: general session → find or create track + milestone (legacy) ──
  let trackId: string;

  const { data: existingTrack } = await supabase
    .from("tracks")
    .select("id")
    .eq("user_id", user.id)
    .eq("title", topic)
    .limit(1)
    .maybeSingle();

  if (existingTrack) {
    trackId = existingTrack.id;
  } else {
    const { data: newTrack, error: trackError } = await supabase
      .from("tracks")
      .insert({
        user_id:           user.id,
        title:             topic,
        topic_description: `Learning track for ${topic}`,
        status:            "active",
      })
      .select("id")
      .single();

    if (trackError || !newTrack) {
      return NextResponse.json({ error: "Failed to create track" }, { status: 500 });
    }
    trackId = newTrack.id;
  }

  const { data: milestone, error: milestoneError } = await supabase
    .from("milestones")
    .insert({
      track_id:      trackId,
      title:         entryTitle,
      summary:       entryBody,
      kanban_column: "learn",
      position:      0,
    })
    .select("id")
    .single();

  if (milestoneError || !milestone) {
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }

  return NextResponse.json({ milestoneId: milestone.id, trackId, saved: true });
}
