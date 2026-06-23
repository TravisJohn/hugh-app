import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

/**
 * Edit a diary entry, or accept Hugh's suggested correction.
 *
 * Body shapes:
 *  - { action: "accept" }            → apply `correction` to the body, clear the warning
 *  - { body?: string, title?: string } → edit the entry; resets fact_status to
 *    'pending' so the client can re-verify. The permanent gap_note is preserved.
 *
 * Returns the updated entry.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entryId } = await params;
  const body = (await request.json()) as {
    action?: "accept";
    body?:   string;
    title?:  string;
  };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("milestone_entries")
    .select("*")
    .eq("id", entryId)
    .eq("user_id", userId)
    .single();

  if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  let update: Record<string, unknown>;

  if (body.action === "accept") {
    if (!existing.correction) {
      return NextResponse.json({ error: "No correction to accept" }, { status: 400 });
    }
    // Apply the fix, clear the warning, keep the gap note as a permanent record.
    update = {
      body:        existing.correction,
      correction:  null,
      fact_status: "correct",
      corrected:   true,
    };
  } else {
    const newBody  = body.body?.trim();
    const newTitle = body.title?.trim();
    if (!newBody) {
      return NextResponse.json({ error: "Entry body is required" }, { status: 400 });
    }
    // Edited content → re-check needed. Preserve gap_note (permanent).
    update = {
      body:        newBody,
      title:       newTitle || existing.title,
      correction:  null,
      fact_status: "pending",
      corrected:   false,
    };
  }

  const { data: updated, error } = await supabase
    .from("milestone_entries")
    .update(update)
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    console.error("[tracker/entries PATCH] DB error:", error.message);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }

  return NextResponse.json({ entry: updated });
}
