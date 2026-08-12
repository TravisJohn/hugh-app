import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { canGroup, planDissolve, planGroup, type TreeItem, type TreeKind } from "@/lib/notes/tree";
import type { Note, Notebook } from "@/types";

// Grouping: wrap a Ctrl+click selection in a new folder, or dissolve a folder
// back into its parent. Both levels of the tree work the same way, so `kind`
// picks the table and everything else is shared.
//
// A folder is a row with is_group = true in the SAME table as the things it
// holds (migration 034), which is what lets a folder and a notebook sit as
// siblings in one ordered list.
//
// The guards live in lib/notes/tree.ts and run here as well as in the UI, so a
// stale client can't write a shape the tree can't render — in particular a page
// can never end up outside its notebook.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

type Row = (Notebook | Note) & { notebook_id?: string };

const TABLE: Record<TreeKind, "notebooks" | "notes"> = {
  notebook: "notebooks",
  note:     "notes",
};

function parseKind(value: string | null | undefined): TreeKind | null {
  return value === "notebook" || value === "note" ? value : null;
}

function toItems(rows: Row[], kind: TreeKind): TreeItem[] {
  return rows.map((r) => ({
    id: r.id, kind, parent_id: r.parent_id, is_group: r.is_group, notebook_id: r.notebook_id,
  }));
}

const touched = () => ({ updated_at: new Date().toISOString() });

// POST /api/notes/group { kind, ids[] } → { group, moved: string[] }
// Creates an empty folder in place of the shallowest selected item and moves
// the whole selection inside it, keeping their existing relative order.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as { kind?: string; ids?: string[] };
  const kind = parseKind(body.kind);
  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string") : [];
  if (!kind) return NextResponse.json({ error: "kind must be notebook or note" }, { status: 400 });
  if (ids.length < 2) return NextResponse.json({ error: "Pick at least two things to group." }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db.from(TABLE[kind]).select("*").eq("user_id", userId);
    if (error) throw error;
    const rows = (data ?? []) as Row[];

    const check = canGroup(ids, toItems(rows, kind));
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

    const plan = planGroup(ids, rows);
    if (!plan) return NextResponse.json({ error: "Some of that selection no longer exists." }, { status: 400 });

    const insert: Record<string, unknown> = {
      user_id:   userId,
      title:     "New group",
      is_group:  true,
      parent_id: plan.parent_id,
      position:  plan.position,
    };
    if (kind === "note") insert.notebook_id = plan.notebook_id;

    const { data: created, error: insErr } = await db
      .from(TABLE[kind]).insert(insert).select("*").single();
    if (insErr) throw insErr;

    const groupId = (created as Row).id;
    const moves = await Promise.all(plan.members.map((m) =>
      db.from(TABLE[kind]).update({ parent_id: groupId, position: m.position, ...touched() })
        .eq("id", m.id).eq("user_id", userId),
    ));
    const failed = moves.find((m) => m.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({ group: created, moved: plan.members.map((m) => m.id) });
  } catch (e) {
    console.error("[notes/group] create failed:", e);
    return NextResponse.json({ error: "Couldn't group those." }, { status: 502 });
  }
}

// DELETE /api/notes/group?kind=<kind>&id=<id> → dissolve.
// The folder goes; everything inside it lifts up one level and takes the
// folder's place in the order. Nothing is deleted — deleting content is always
// a per-notebook or per-page action, so a stray click here can't wipe a branch.
export async function DELETE(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const kind = parseKind(request.nextUrl.searchParams.get("kind"));
  const id = request.nextUrl.searchParams.get("id");
  if (!kind) return NextResponse.json({ error: "kind must be notebook or note" }, { status: 400 });
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db.from(TABLE[kind]).select("*").eq("user_id", userId);
    if (error) throw error;
    const rows = (data ?? []) as Row[];

    const group = rows.find((r) => r.id === id);
    if (!group) return NextResponse.json({ error: "That folder no longer exists." }, { status: 404 });
    if (!group.is_group) return NextResponse.json({ error: "That isn't a folder." }, { status: 400 });

    const plan = planDissolve(id, rows);
    if (!plan) return NextResponse.json({ error: "That isn't a folder." }, { status: 400 });

    // Re-parent first, delete second: a child still pointing at the folder when
    // it goes would be taken out by the FK cascade.
    const writes = await Promise.all([
      ...plan.lifted.map((u) =>
        db.from(TABLE[kind]).update({ parent_id: u.parent_id, position: u.position, ...touched() })
          .eq("id", u.id).eq("user_id", userId)),
      ...plan.resorted.map((u) =>
        db.from(TABLE[kind]).update({ position: u.position })
          .eq("id", u.id).eq("user_id", userId)),
    ]);
    const failed = writes.find((w) => w.error);
    if (failed?.error) throw failed.error;

    const { error: delErr } = await db.from(TABLE[kind]).delete().eq("id", group.id).eq("user_id", userId);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, lifted: plan.lifted.map((u) => u.id) });
  } catch (e) {
    console.error("[notes/group] dissolve failed:", e);
    return NextResponse.json({ error: "Couldn't dissolve that folder." }, { status: 502 });
  }
}
