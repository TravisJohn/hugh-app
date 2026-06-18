import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { generateTrack } from "@/lib/tracker/generate";

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body  = (await request.json()) as { topic: string };
  const topic = body.topic?.trim();

  if (!topic || topic.length < 3) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const trackId  = await generateTrack(supabase, userId, topic);
    return NextResponse.json({ trackId });
  } catch (err) {
    console.error("[tracker/generate]", err);
    return NextResponse.json({ error: "Failed to generate curriculum" }, { status: 502 });
  }
}
