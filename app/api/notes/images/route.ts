import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { NOTE_IMAGES_BUCKET, SIGNED_URL_TTL } from "@/lib/notes/storage";
import type { NoteImage } from "@/types";

// Screenshots for a note. Uploads go through this route (service-role) so we can
// validate size/type and key the object under the owner's id; reads hand back
// short-lived signed URLs. The Anthropic/OpenAI keys never touch the client, and
// neither does the Storage service key.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per screenshot
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const IMAGE_COLS = "id, note_id, title, storage_path, mime, created_at";

// Attach a fresh signed URL to each image row (best-effort per row).
async function withSignedUrls(
  db: ReturnType<typeof createServiceClient>,
  rows: Array<Pick<NoteImage, "id" | "note_id" | "title" | "storage_path" | "mime" | "created_at">>,
): Promise<NoteImage[]> {
  return Promise.all(
    rows.map(async (r) => {
      const { data } = await db.storage
        .from(NOTE_IMAGES_BUCKET)
        .createSignedUrl(r.storage_path, SIGNED_URL_TTL);
      return { ...r, url: data?.signedUrl ?? null };
    }),
  );
}

// Confirms the note belongs to this user; returns true/false.
async function ownsNote(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  noteId: string,
): Promise<boolean> {
  const { data } = await db.from("notes").select("id").eq("id", noteId).eq("user_id", userId).maybeSingle();
  return !!data;
}

// GET /api/notes/images?note_id=<id> → { images: NoteImage[] } with signed URLs.
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const noteId = request.nextUrl.searchParams.get("note_id");
  if (!noteId) return NextResponse.json({ error: "note_id required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("note_images")
      .select(IMAGE_COLS)
      .eq("user_id", userId)
      .eq("note_id", noteId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const images = await withSignedUrls(db, data ?? []);
    return NextResponse.json({ images });
  } catch (e) {
    console.error("[notes/images] list failed:", e);
    return NextResponse.json({ error: "Couldn't load images." }, { status: 502 });
  }
}

// POST /api/notes/images (multipart: note_id, file) → the created NoteImage.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const noteId = String(form.get("note_id") ?? "").trim();
  const file = form.get("file");
  if (!noteId) return NextResponse.json({ error: "note_id required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });

  const ext = ALLOWED_MIME[file.type];
  if (!ext) return NextResponse.json({ error: "Only PNG, JPEG, WebP or GIF images are supported." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 10 MB." }, { status: 413 });

  try {
    const db = createServiceClient();
    if (!(await ownsNote(db, userId, noteId))) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    // Default the title to "Screenshot N" (1-based) from the current count, so a
    // fresh screenshot arrives already labelled and orderable at a glance.
    const { count } = await db
      .from("note_images")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("note_id", noteId);
    const title = `Screenshot ${(count ?? 0) + 1}`;

    const path = `${userId}/${noteId}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await db.storage
      .from(NOTE_IMAGES_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;

    const { data, error } = await db
      .from("note_images")
      .insert({ user_id: userId, note_id: noteId, title, storage_path: path, mime: file.type })
      .select(IMAGE_COLS)
      .single();
    if (error) throw error;

    const [image] = await withSignedUrls(db, [data]);
    return NextResponse.json({ image });
  } catch (e) {
    console.error("[notes/images] upload failed:", e);
    return NextResponse.json({ error: "Couldn't upload that image." }, { status: 502 });
  }
}

// PATCH /api/notes/images { id, title } → rename a screenshot.
export async function PATCH(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as { id?: string; title?: string };
  const id = body.id?.trim();
  const title = body.title?.trim().slice(0, 200);
  if (!id || !title) return NextResponse.json({ error: "id and title required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("note_images")
      .update({ title })
      .eq("id", id)
      .eq("user_id", userId)
      .select(IMAGE_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Image not found." }, { status: 404 });

    const [image] = await withSignedUrls(db, [data]);
    return NextResponse.json({ image });
  } catch (e) {
    console.error("[notes/images] rename failed:", e);
    return NextResponse.json({ error: "Couldn't rename that image." }, { status: 502 });
  }
}

// DELETE /api/notes/images?id=<imageId> → remove the row and its Storage object.
export async function DELETE(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data: row } = await db
      .from("note_images").select("storage_path").eq("id", id).eq("user_id", userId).maybeSingle();
    if (row?.storage_path) {
      await db.storage.from(NOTE_IMAGES_BUCKET).remove([row.storage_path as string]);
    }
    const { error } = await db.from("note_images").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[notes/images] delete failed:", e);
    return NextResponse.json({ error: "Couldn't delete that image." }, { status: 502 });
  }
}
