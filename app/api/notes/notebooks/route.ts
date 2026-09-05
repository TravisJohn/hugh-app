import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { requireProvisionedApi } from "@/lib/auth/requireProvisioned";
import { createServiceClient } from "@/lib/supabase/service";
import { purgeNoteImageFiles } from "@/lib/notes/storage";
import { nextPosition } from "@/lib/notes/positions";
import type { Notebook, Note } from "@/types";

// Notebooks = the branches of the Notes tree. GET returns the whole tree
// (notebooks + their leaf notes) in one shot for the workspace's initial load.
// Every op is scoped to the authenticated user_id via the service-role client.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

// GET /api/notes/notebooks → { notebooks, notes } — the whole tree as FLAT rows.
// Nesting happens client-side in lib/notes/tree.ts, which keeps one nesting
// implementation (shared with the grouping guards) instead of a recursive SQL
// query here and a second walk in the UI.
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "notes");
  if (denied) return denied;

  try {
    const db = createServiceClient();
    const [{ data: nbs, error: e1 }, { data: notes, error: e2 }] = await Promise.all([
      db.from("notebooks").select("*").eq("user_id", userId)
        .order("position", { ascending: true }).order("created_at", { ascending: true }),
      db.from("notes").select("*").eq("user_id", userId)
        .order("position", { ascending: true }).order("created_at", { ascending: true }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    return NextResponse.json({
      notebooks: (nbs ?? []) as Notebook[],
      notes:     (notes ?? []) as Note[],
    });
  } catch (e) {
    console.error("[notes/notebooks] tree failed:", e);
    return NextResponse.json({ error: "Couldn't load your notes." }, { status: 502 });
  }
}

// POST /api/notes/notebooks { title? } → the created notebook.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "notes");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const title = (body.title?.trim() || "Untitled notebook").slice(0, 200);

  try {
    const db = createServiceClient();
    const position = await nextPosition(db, "notebooks", { user_id: userId });
    const { data, error } = await db
      .from("notebooks")
      .insert({ user_id: userId, title, position })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ notebook: data as Notebook });
  } catch (e) {
    console.error("[notes/notebooks] create failed:", e);
    return NextResponse.json({ error: "Couldn't create that notebook." }, { status: 502 });
  }
}

// PATCH /api/notes/notebooks { id, title?, position?, bagged? } → rename,
// reorder, or tuck away. `bagged` is a timestamp under the hood so the Bag
// drawer can sort by most-recently-put-away without another column.
export async function PATCH(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "notes");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string; title?: string; position?: number; bagged?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200) || "Untitled notebook";
  if (typeof body.position === "number") patch.position = body.position;
  if (typeof body.bagged === "boolean") patch.bagged_at = body.bagged ? new Date().toISOString() : null;

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("notebooks")
      .update(patch)
      .eq("id", body.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ notebook: data as Notebook });
  } catch (e) {
    console.error("[notes/notebooks] update failed:", e);
    return NextResponse.json({ error: "Couldn't update that notebook." }, { status: 502 });
  }
}

// DELETE /api/notes/notebooks?id=<id> → remove notebook + its notes (cascade),
// purging the underlying screenshot files from Storage first.
export async function DELETE(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "notes");
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const db = createServiceClient();

    // Folders are dissolved, never deleted — /api/notes/group lifts their
    // contents out first, so a stray trash click can't take a branch with it.
    const { data: row } = await db
      .from("notebooks").select("is_group").eq("id", id).eq("user_id", userId).maybeSingle();
    if (row?.is_group) {
      return NextResponse.json({ error: "Use dissolve to remove a folder." }, { status: 400 });
    }

    const { data: noteRows } = await db
      .from("notes").select("id").eq("user_id", userId).eq("notebook_id", id);
    await purgeNoteImageFiles(db, userId, (noteRows ?? []).map((r) => r.id as string));

    const { error } = await db.from("notebooks").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[notes/notebooks] delete failed:", e);
    return NextResponse.json({ error: "Couldn't delete that notebook." }, { status: 502 });
  }
}
