import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { type KanbanColumn } from "@/types";

const VALID_COLUMNS: KanbanColumn[] = ["backlog", "learn", "review", "done"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    column?:           KanbanColumn;
    reviewValidated?:  boolean;
    masteryValidated?: boolean;
    masteryScore?:     number;
  };

  const updateData: {
    kanban_column?:     KanbanColumn;
    review_validated?:  boolean;
    mastery_validated?: boolean;
    mastery_score?:     number | null;
  } = {};

  if (body.column !== undefined) {
    if (!VALID_COLUMNS.includes(body.column)) {
      return NextResponse.json({ error: "Invalid column" }, { status: 400 });
    }
    updateData.kanban_column = body.column;
  }

  if (body.reviewValidated !== undefined) {
    updateData.review_validated = body.reviewValidated;
  }

  if (body.masteryValidated !== undefined) {
    updateData.mastery_validated = body.masteryValidated;
  }

  if (body.masteryScore !== undefined) {
    updateData.mastery_score = body.masteryScore;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = await createClient();

  // Confirm the milestone belongs to this user via its track
  const { data: milestone, error: fetchError } = await supabase
    .from("milestones")
    .select("id, tracks!inner(user_id)")
    .eq("id", id)
    .single();

  if (fetchError || !milestone) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("milestones")
    .update(updateData)
    .eq("id", id);

  if (updateError) {
    console.error("[tracker/milestones PATCH] DB error:", updateError.message);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
