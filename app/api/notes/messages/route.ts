import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { requireProvisionedApi } from "@/lib/auth/requireProvisioned";
import { createServiceClient } from "@/lib/supabase/service";
import type { NoteMessage } from "@/types";

// The per-screenshot chat thread. This route only reads a screenshot's thread
// and appends the learner's OWN messages (their thoughts) — no AI runs here.
// Hugh's replies are produced deliberately by /api/notes/coach so an AI call is
// never accidental. Threads are scoped by image_id: each screenshot is its own
// conversation.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

const MESSAGE_COLS = "id, note_id, image_id, role, content, created_at";

// Resolve the screenshot the learner owns; returns its note_id or null.
async function ownedImageNoteId(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  imageId: string,
): Promise<string | null> {
  const { data } = await db
    .from("note_images").select("note_id").eq("id", imageId).eq("user_id", userId).maybeSingle();
  return (data?.note_id as string | undefined) ?? null;
}

// GET /api/notes/messages?image_id=<id> → { messages: NoteMessage[] } oldest first.
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "notes");
  if (denied) return denied;

  const imageId = request.nextUrl.searchParams.get("image_id");
  if (!imageId) return NextResponse.json({ error: "image_id required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("note_messages")
      .select(MESSAGE_COLS)
      .eq("user_id", userId)
      .eq("image_id", imageId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ messages: (data ?? []) as NoteMessage[] });
  } catch (e) {
    console.error("[notes/messages] list failed:", e);
    return NextResponse.json({ error: "Couldn't load this thread." }, { status: 502 });
  }
}

// POST /api/notes/messages { image_id, content } → append the learner's message.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "notes");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { image_id?: string; content?: string };
  const imageId = body.image_id?.trim();
  const content = body.content?.trim().slice(0, 8000);
  if (!imageId || !content) return NextResponse.json({ error: "image_id and content required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const noteId = await ownedImageNoteId(db, userId, imageId);
    if (!noteId) return NextResponse.json({ error: "Screenshot not found." }, { status: 404 });

    const { data, error } = await db
      .from("note_messages")
      .insert({ user_id: userId, note_id: noteId, image_id: imageId, role: "user", content })
      .select(MESSAGE_COLS)
      .single();
    if (error) throw error;
    return NextResponse.json({ message: data as NoteMessage });
  } catch (e) {
    console.error("[notes/messages] create failed:", e);
    return NextResponse.json({ error: "Couldn't save that note." }, { status: 502 });
  }
}
