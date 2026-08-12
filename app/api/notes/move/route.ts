import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { canMove, planMove, type TreeItem, type TreeKind } from "@/lib/notes/tree";
import type { Note, Notebook } from "@/types";

// One endpoint for every drag in the sidebar: dropping between rows reorders,
// dropping onto a folder re-parents, and both arrive here as the same
// (parent_id, index) pair. The guards run server-side too, so a stale client
// can't write a shape the tree can't render — above all, a page outside its
// notebook.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

type Row = (Notebook | Note) & { notebook_id?: string };

const TABLE: Record<TreeKind, "notebooks" | "notes"> = {
  notebook: "notebooks",
  note:     "notes",
};

// PATCH /api/notes/move { kind, id, parent_id, index, notebook_id? }
// `index` is the slot as displayed; the planner handles the off-by-one when a
// row is dragged within the list it already belongs to.
export async function PATCH(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string; id?: string; parent_id?: string | null; index?: number; notebook_id?: string;
  };
  const kind = body.kind === "notebook" || body.kind === "note" ? body.kind : null;
  const id = body.id?.trim();
  const parentId = body.parent_id ?? null;
  const index = typeof body.index === "number" && Number.isFinite(body.index) ? body.index : null;

  if (!kind) return NextResponse.json({ error: "kind must be notebook or note" }, { status: 400 });
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (index === null) return NextResponse.json({ error: "index required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db.from(TABLE[kind]).select("*").eq("user_id", userId);
    if (error) throw error;
    const rows = (data ?? []) as Row[];

    const items: TreeItem[] = rows.map((r) => ({
      id: r.id, kind, parent_id: r.parent_id, is_group: r.is_group, notebook_id: r.notebook_id,
    }));
    const check = canMove(id, parentId, items, body.notebook_id);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

    const plan = planMove(id, parentId, index, rows);
    if (!plan) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });

    const writes = await Promise.all([
      db.from(TABLE[kind])
        .update({
          parent_id: plan.moved.parent_id,
          position:  plan.moved.position,
          updated_at: new Date().toISOString(),
        })
        .eq("id", plan.moved.id).eq("user_id", userId),
      ...plan.resorted.map((u) =>
        db.from(TABLE[kind]).update({ position: u.position }).eq("id", u.id).eq("user_id", userId)),
    ]);
    const failed = writes.find((w) => w.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[notes/move] failed:", e);
    return NextResponse.json({ error: "Couldn't move that." }, { status: 502 });
  }
}
