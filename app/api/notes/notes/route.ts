import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { purgeNoteImageFiles } from "@/lib/notes/storage";
import { nextPosition } from "@/lib/notes/positions";
import type { Note } from "@/types";

// Notes = the leaves of the tree. A note owns a set of screenshots and one chat
// thread. Every op is scoped to the authenticated user_id.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

// POST /api/notes/notes { notebook_id, title? } → the created note.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as { notebook_id?: string; title?: string };
  const notebook_id = body.notebook_id?.trim();
  if (!notebook_id) return NextResponse.json({ error: "notebook_id required" }, { status: 400 });
  const title = (body.title?.trim() || "Untitled").slice(0, 200);

  try {
    const db = createServiceClient();

    // Confirm the parent notebook belongs to this user before attaching a note.
    const { data: nb } = await db
      .from("notebooks").select("id").eq("id", notebook_id).eq("user_id", userId).maybeSingle();
    if (!nb) return NextResponse.json({ error: "Notebook not found." }, { status: 404 });

    const position = await nextPosition(db, "notes", { user_id: userId, notebook_id });
    const { data, error } = await db
      .from("notes")
      .insert({ user_id: userId, notebook_id, title, position })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ note: data as Note });
  } catch (e) {
    console.error("[notes/notes] create failed:", e);
    return NextResponse.json({ error: "Couldn't create that note." }, { status: 502 });
  }
}

// PATCH /api/notes/notes { id, title?, position?, bagged? } → rename, reorder,
// or tuck away into the Bag.
export async function PATCH(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    id?: string; title?: string; position?: number; bagged?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200) || "Untitled";
  if (typeof body.position === "number") patch.position = body.position;
  if (typeof body.bagged === "boolean") patch.bagged_at = body.bagged ? new Date().toISOString() : null;

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("notes")
      .update(patch)
      .eq("id", body.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ note: data as Note });
  } catch (e) {
    console.error("[notes/notes] update failed:", e);
    return NextResponse.json({ error: "Couldn't update that note." }, { status: 502 });
  }
}

// DELETE /api/notes/notes?id=<id> → remove note (images + messages cascade),
// purging the note's screenshot files from Storage first.
export async function DELETE(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const db = createServiceClient();

    // Page folders are dissolved via /api/notes/group, not deleted — otherwise
    // the FK cascade would take every page inside and strand their screenshots.
    const { data: row } = await db
      .from("notes").select("is_group").eq("id", id).eq("user_id", userId).maybeSingle();
    if (row?.is_group) {
      return NextResponse.json({ error: "Use dissolve to remove a folder." }, { status: 400 });
    }

    await purgeNoteImageFiles(db, userId, [id]);
    const { error } = await db.from("notes").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[notes/notes] delete failed:", e);
    return NextResponse.json({ error: "Couldn't delete that note." }, { status: 502 });
  }
}
