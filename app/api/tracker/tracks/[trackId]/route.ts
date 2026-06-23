import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { type BacklogPriorityMode } from "@/types";

/**
 * Update track-level state:
 *  - `focusMilestoneId`     — the persistent "focus" milestone (glowing card + Ask goal)
 *  - `backlogPriorityMode`  — 'auto' (Hugh's build-order ranks) | 'manual' (learner reorders)
 *
 * Body: { focusMilestoneId?: string | null, backlogPriorityMode?: 'auto' | 'manual' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trackId } = await params;
  const body = (await request.json()) as {
    focusMilestoneId?:    string | null;
    backlogPriorityMode?: BacklogPriorityMode;
  };

  const update: { focus_milestone_id?: string | null; backlog_priority_mode?: BacklogPriorityMode } = {};

  if ("focusMilestoneId" in body) {
    update.focus_milestone_id = body.focusMilestoneId ?? null;
  }

  if ("backlogPriorityMode" in body) {
    if (body.backlogPriorityMode !== "auto" && body.backlogPriorityMode !== "manual") {
      return NextResponse.json({ error: "Invalid backlogPriorityMode" }, { status: 400 });
    }
    update.backlog_priority_mode = body.backlogPriorityMode;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("tracks")
    .update(update)
    .eq("id", trackId)
    .eq("user_id", userId)
    .select("id, focus_milestone_id, backlog_priority_mode")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Failed to update track" }, { status: 500 });
  }

  return NextResponse.json({ track: updated });
}
