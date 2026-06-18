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
  const body = (await request.json()) as { column: KanbanColumn };

  if (!VALID_COLUMNS.includes(body.column)) {
    return NextResponse.json({ error: "Invalid column" }, { status: 400 });
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
    .update({ kanban_column: body.column })
    .eq("id", id);

  if (updateError) {
    console.error("[tracker/milestones PATCH] DB error:", updateError.message);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
