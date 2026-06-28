import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { isValidPointTag } from "@/lib/tracker/points";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("milestone_entries")
    .select("*")
    .eq("milestone_id", id)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { body: string; title?: string; pointId?: string | null };

  const text  = body.body?.trim();
  const title = body.title?.trim() ?? null;
  if (!text) {
    return NextResponse.json({ error: "Entry body is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // A tag pointing at a non-existent learning point is dropped, not rejected.
  const tag = (await isValidPointTag(supabase, id, body.pointId)) ? body.pointId ?? null : null;

  const { data, error } = await supabase
    .from("milestone_entries")
    .insert({ milestone_id: id, user_id: userId, body: text, title, point_id: tag })
    .select("*")
    .single();

  if (error) {
    console.error("[tracker/entries POST] DB error:", error.message);
    return NextResponse.json({ error: "Failed to save entry" }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}
