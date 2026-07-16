import { type NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { NOTE_IMAGES_BUCKET } from "@/lib/notes/storage";
import { buildCoachMessages, type CoachThreadMessage } from "@/lib/notes/coachPrompt";
import type { NoteMessage } from "@/types";

export const dynamic = "force-dynamic";
// Vision + a short reply can take a few seconds; give it headroom.
export const maxDuration = 60;

// The Coach: Hugh reads ONE screenshot + that screenshot's chat thread and
// appends a correction. Threads are per screenshot, so the Coach's attention is
// scoped to the exact image the learner is looking at. This is the only Notes
// route that calls an LLM, so it's the only one that can be slow or cost money —
// it runs only on an explicit "Coach" press. Model + client pattern mirror
// app/api/architecture/chat.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

// POST /api/notes/coach { image_id } → { message: NoteMessage } (assistant reply)
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as { image_id?: string };
  const imageId = body.image_id?.trim();
  if (!imageId) return NextResponse.json({ error: "image_id required" }, { status: 400 });

  // Instantiate per request so the build never needs the key; a missing key is
  // a graceful 503, not a crash — this feature is optional per deployment.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The Coach isn't configured on this deployment (missing OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  try {
    const db = createServiceClient();

    // Ownership: resolve the screenshot (and its note) for this user.
    const { data: image } = await db
      .from("note_images").select("note_id, storage_path, mime")
      .eq("id", imageId).eq("user_id", userId).maybeSingle();
    if (!image) return NextResponse.json({ error: "Screenshot not found." }, { status: 404 });

    // This screenshot's thread only.
    const { data: msgRows } = await db
      .from("note_messages").select("role, content").eq("user_id", userId).eq("image_id", imageId)
      .order("created_at", { ascending: true });
    const thread = (msgRows ?? []) as CoachThreadMessage[];

    // Inline the one screenshot's bytes as a base64 data URL so the model gets it
    // directly (no dependency on OpenAI reaching Supabase Storage).
    const dataUrl = await toDataUrl(db, image.storage_path as string, image.mime as string);
    if (!dataUrl) {
      return NextResponse.json({ error: "Couldn't read that screenshot. Try again." }, { status: 502 });
    }

    const messages = buildCoachMessages(thread, [dataUrl]);

    const openai = new OpenAI({ apiKey });
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages,
    });
    // Visibility into OpenAI's automatic prompt caching (no code lever to pull —
    // it kicks in on its own once the shared system+image prefix clears ~1024
    // tokens). Cheap to leave in: one log line, no impact on the response.
    console.log(
      `[notes/coach] prompt_tokens=${res.usage?.prompt_tokens ?? "?"} ` +
      `cached_tokens=${res.usage?.prompt_tokens_details?.cached_tokens ?? 0}`,
    );

    const reply = res.choices[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json({ error: "The Coach couldn't respond just now. Try again." }, { status: 502 });
    }

    const { data, error } = await db
      .from("note_messages")
      .insert({ user_id: userId, note_id: image.note_id, image_id: imageId, role: "assistant", content: reply })
      .select("id, note_id, image_id, role, content, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ message: data as NoteMessage });
  } catch (e) {
    console.error("[notes/coach] failed:", e);
    return NextResponse.json({ error: "The Coach ran into a problem. Try again." }, { status: 502 });
  }
}

// Download one screenshot from Storage and encode it as a data: URL, or null on
// failure (a single unreadable image shouldn't sink the whole Coach turn).
async function toDataUrl(
  db: ReturnType<typeof createServiceClient>,
  storagePath: string,
  mime: string,
): Promise<string | null> {
  const { data, error } = await db.storage.from(NOTE_IMAGES_BUCKET).download(storagePath);
  if (error || !data) return null;
  const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
  return `data:${mime};base64,${base64}`;
}
