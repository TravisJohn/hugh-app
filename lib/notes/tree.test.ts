import { describe, it, expect } from "vitest";
import {
  buildTree, canGroup, canMove, pathTo, planDissolve, planGroup, planMove, reindex,
  type PositionedRow, type TreeItem,
} from "./tree";
import type { Note, Notebook } from "@/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Terse builders so each test reads as the shape it is about, not as plumbing.

let clock = 0;
const stamp = () => `2026-08-12T00:00:${String(clock++).padStart(2, "0")}Z`;

function nb(id: string, over: Partial<Notebook> = {}): Notebook {
  return {
    id, user_id: "u1", title: id, position: 0,
    created_at: stamp(), updated_at: stamp(),
    parent_id: null, is_group: false, bagged_at: null,
    ...over,
  };
}

function pg(id: string, notebookId: string, over: Partial<Note> = {}): Note {
  return {
    id, user_id: "u1", notebook_id: notebookId, title: id, position: 0,
    created_at: stamp(), updated_at: stamp(),
    parent_id: null, is_group: false, bagged_at: null,
    ...over,
  };
}

const item = (over: Partial<TreeItem> & Pick<TreeItem, "id" | "kind">): TreeItem => ({
  parent_id: null, is_group: false, ...over,
});

// ── buildTree ────────────────────────────────────────────────────────────────

describe("buildTree", () => {
  it("nests notebooks under their folder in position order, so the sidebar matches what was dragged", () => {
    const tree = buildTree({
      notebooks: [
        nb("folder", { is_group: true }),
        nb("second", { parent_id: "folder", position: 1 }),
        nb("first", { parent_id: "folder", position: 0 }),
        nb("loose", { position: 1 }),
      ],
      notes: [],
    });

    expect(tree.roots.map((n) => n.id)).toEqual(["folder", "loose"]);
    expect(tree.roots[0].children.map((n) => n.id)).toEqual(["first", "second"]);
  });

  it("falls back to created_at when siblings share a position, so a fresh insert never makes the list jitter", () => {
    const tree = buildTree({
      notebooks: [
        nb("later", { position: 0, created_at: "2026-08-12T10:00:00Z" }),
        nb("earlier", { position: 0, created_at: "2026-08-12T09:00:00Z" }),
      ],
      notes: [],
    });

    expect(tree.roots.map((n) => n.id)).toEqual(["earlier", "later"]);
  });

  it("nests a notebook's pages into their own group tree, kept separate from the notebook tree", () => {
    const tree = buildTree({
      notebooks: [nb("book")],
      notes: [
        pg("pageGroup", "book", { is_group: true }),
        pg("inner", "book", { parent_id: "pageGroup" }),
        pg("top", "book", { position: 1 }),
      ],
    });

    expect(tree.roots[0].notes.map((n) => n.id)).toEqual(["pageGroup", "top"]);
    expect(tree.roots[0].notes[0].children.map((n) => n.id)).toEqual(["inner"]);
  });

  it("records depth per level so the sidebar can indent without recomputing the walk", () => {
    const tree = buildTree({
      notebooks: [
        nb("outer", { is_group: true }),
        nb("mid", { parent_id: "outer", is_group: true }),
        nb("leaf", { parent_id: "mid" }),
      ],
      notes: [],
    });

    expect(tree.roots[0].depth).toBe(0);
    expect(tree.roots[0].children[0].depth).toBe(1);
    expect(tree.roots[0].children[0].children[0].depth).toBe(2);
  });

  it("lifts a bagged folder out of the tree as ONE entry carrying its whole subtree", () => {
    const tree = buildTree({
      notebooks: [
        nb("archive", { is_group: true, bagged_at: stamp() }),
        nb("old1", { parent_id: "archive" }),
        nb("old2", { parent_id: "archive" }),
        nb("active"),
      ],
      notes: [],
    });

    expect(tree.roots.map((n) => n.id)).toEqual(["active"]);
    expect(tree.bagged).toHaveLength(1);
    expect(tree.bagged[0].node.id).toBe("archive");
    expect((tree.bagged[0].node as { children: Array<{ id: string }> }).children.map((c) => c.id))
      .toEqual(["old1", "old2"]);
  });

  it("does not list a bagged item twice when it sits inside an already-bagged branch", () => {
    const tree = buildTree({
      notebooks: [
        nb("archive", { is_group: true, bagged_at: stamp() }),
        nb("alsoBagged", { parent_id: "archive", bagged_at: stamp() }),
      ],
      notes: [],
    });

    expect(tree.bagged).toHaveLength(1);
    expect(tree.bagged[0].node.id).toBe("archive");
  });

  it("labels a bagged page with its notebook's title so the drawer can say where it goes back to", () => {
    const tree = buildTree({
      notebooks: [nb("book", { title: "GCP Data Engineer" })],
      notes: [pg("hidden", "book", { bagged_at: stamp() }), pg("shown", "book")],
    });

    expect(tree.roots[0].notes.map((n) => n.id)).toEqual(["shown"]);
    expect(tree.bagged).toEqual([
      expect.objectContaining({ kind: "note", notebook_id: "book", notebook_title: "GCP Data Engineer" }),
    ]);
  });

  it("keeps a bagged notebook's pages inside it rather than scattering them through the drawer", () => {
    const tree = buildTree({
      notebooks: [nb("book", { bagged_at: stamp() })],
      notes: [pg("alsoBagged", "book", { bagged_at: stamp() })],
    });

    // One entry: the notebook. Its own bagged page must not become a second.
    expect(tree.bagged).toHaveLength(1);
    expect(tree.bagged[0].kind).toBe("notebook");
  });

  it("treats a row whose parent has vanished as a root, so nothing silently disappears", () => {
    const tree = buildTree({
      notebooks: [nb("orphan", { parent_id: "deleted-folder" })],
      notes: [],
    });

    expect(tree.roots.map((n) => n.id)).toEqual(["orphan"]);
  });

  it("survives a corrupt parent cycle by leaving those rows out instead of hanging", () => {
    const tree = buildTree({
      notebooks: [
        nb("a", { parent_id: "b", is_group: true }),
        nb("b", { parent_id: "a", is_group: true }),
        nb("fine"),
      ],
      notes: [],
    });

    expect(tree.roots.map((n) => n.id)).toEqual(["fine"]);
  });
});

// ── pathTo ───────────────────────────────────────────────────────────────────

describe("pathTo", () => {
  const tree = buildTree({
    notebooks: [
      nb("outer", { is_group: true }),
      nb("book", { parent_id: "outer" }),
      nb("other"),
    ],
    notes: [
      pg("pageGroup", "book", { is_group: true }),
      pg("target", "book", { parent_id: "pageGroup" }),
    ],
  });

  it("returns every ancestor needed to reveal a deeply nested page on entry", () => {
    expect(pathTo(tree, "target")).toEqual(new Set(["outer", "book", "pageGroup"]));
  });

  it("returns nothing for an unknown page, so a stale saved id just opens collapsed", () => {
    expect(pathTo(tree, "deleted-page").size).toBe(0);
  });
});

// ── canGroup ─────────────────────────────────────────────────────────────────

describe("canGroup", () => {
  const items: TreeItem[] = [
    item({ id: "n1", kind: "notebook" }),
    item({ id: "n2", kind: "notebook" }),
    item({ id: "folder", kind: "notebook", is_group: true }),
    item({ id: "inFolder", kind: "notebook", parent_id: "folder" }),
    item({ id: "p1", kind: "note", notebook_id: "n1" }),
    item({ id: "p2", kind: "note", notebook_id: "n1" }),
    item({ id: "pOther", kind: "note", notebook_id: "n2" }),
  ];

  it("groups two notebooks", () => {
    expect(canGroup(["n1", "n2"], items)).toEqual({ ok: true });
  });

  it("groups a notebook with an existing folder, which is what makes nesting free-form", () => {
    expect(canGroup(["folder", "n1"], items)).toEqual({ ok: true });
  });

  it("groups two pages in the same notebook", () => {
    expect(canGroup(["p1", "p2"], items)).toEqual({ ok: true });
  });

  it("refuses a single selection, since one thing is not a group", () => {
    expect(canGroup(["n1"], items).ok).toBe(false);
  });

  it("refuses to group a page with a notebook, because pages are bounded by their notebook", () => {
    const result = canGroup(["n1", "p1"], items);
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("reason", expect.stringContaining("stay inside their notebook"));
  });

  it("refuses pages from different notebooks, which would move a page out of its notebook", () => {
    expect(canGroup(["p1", "pOther"], items).ok).toBe(false);
  });

  it("refuses a folder selected together with its own child, which would pull the child out", () => {
    expect(canGroup(["folder", "inFolder"], items).ok).toBe(false);
  });

  it("refuses a selection referring to something already deleted", () => {
    expect(canGroup(["n1", "ghost"], items).ok).toBe(false);
  });
});

// ── canMove ──────────────────────────────────────────────────────────────────

describe("canMove", () => {
  const items: TreeItem[] = [
    item({ id: "outer", kind: "notebook", is_group: true }),
    item({ id: "inner", kind: "notebook", is_group: true, parent_id: "outer" }),
    item({ id: "plain", kind: "notebook" }),
    item({ id: "pageFolder", kind: "note", is_group: true, notebook_id: "plain" }),
    item({ id: "page", kind: "note", notebook_id: "plain" }),
    item({ id: "otherPageFolder", kind: "note", is_group: true, notebook_id: "outer" }),
  ];

  it("moves a notebook into a folder", () => {
    expect(canMove("plain", "outer", items)).toEqual({ ok: true });
  });

  it("moves anything back to the top level", () => {
    expect(canMove("inner", null, items)).toEqual({ ok: true });
  });

  it("refuses to drop a folder inside its own descendant, which would orphan the branch", () => {
    expect(canMove("outer", "inner", items).ok).toBe(false);
  });

  it("refuses to drop something into itself", () => {
    expect(canMove("outer", "outer", items).ok).toBe(false);
  });

  it("refuses a plain notebook as a container — only folders hold things", () => {
    expect(canMove("outer", "plain", items).ok).toBe(false);
  });

  it("refuses a page into a notebook folder, keeping the two levels of the tree apart", () => {
    expect(canMove("page", "outer", items).ok).toBe(false);
  });

  it("refuses a page into a page folder belonging to another notebook", () => {
    expect(canMove("page", "otherPageFolder", items).ok).toBe(false);
  });

  it("moves a page into a page folder in its own notebook", () => {
    expect(canMove("page", "pageFolder", items)).toEqual({ ok: true });
  });

  // Every notebook's page list has parent_id null, so the top-level guard needs
  // the destination notebook or a page could be dropped into a different
  // notebook's list and silently snap back to its own.
  it("refuses a page dropped at the top level of a DIFFERENT notebook", () => {
    expect(canMove("page", null, items, "someone-else").ok).toBe(false);
  });

  it("allows a page dropped at the top level of its own notebook", () => {
    expect(canMove("page", null, items, "plain")).toEqual({ ok: true });
  });

  it("ignores the destination notebook when a notebook is what's moving", () => {
    expect(canMove("plain", null, items, "anything")).toEqual({ ok: true });
  });
});

// ── planGroup / planDissolve ─────────────────────────────────────────────────
// These decide where things END UP. Nothing in the UI would obviously look
// wrong if they were subtly off — a folder would just quietly appear in the
// wrong place, or a dissolve would scramble an order — so they're tested hard.

function row(id: string, over: Partial<PositionedRow> = {}): PositionedRow {
  return { id, parent_id: null, position: 0, created_at: stamp(), is_group: false, ...over };
}

describe("planGroup", () => {
  it("puts the folder where the shallowest selection was, not where the deepest one is", () => {
    const rows = [
      row("folder", { is_group: true, position: 0 }),
      row("deep", { parent_id: "folder", position: 0 }),
      row("top", { position: 3 }),
    ];
    // Selecting a nested notebook and a top-level one groups them at the top.
    const plan = planGroup(["deep", "top"], rows)!;
    expect(plan.parent_id).toBeNull();
    expect(plan.position).toBe(3);
  });

  it("keeps members in the order they were already in, not the order they were clicked", () => {
    const rows = [
      row("a", { position: 0 }),
      row("b", { position: 1 }),
      row("c", { position: 2 }),
    ];
    const plan = planGroup(["c", "a", "b"], rows)!;
    expect(plan.members).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("breaks a depth tie by which item sat higher, matching what was on screen", () => {
    const rows = [row("first", { position: 1 }), row("second", { position: 4 })];
    expect(planGroup(["second", "first"], rows)!.position).toBe(1);
  });

  it("carries the notebook through for a page group, so it stays inside its notebook", () => {
    const rows = [
      row("p1", { notebook_id: "book", position: 0 }),
      row("p2", { notebook_id: "book", position: 1 }),
    ];
    expect(planGroup(["p1", "p2"], rows)!.notebook_id).toBe("book");
  });

  it("returns null when part of the selection has gone, so the API can refuse", () => {
    expect(planGroup(["a", "ghost"], [row("a")])).toBeNull();
  });
});

describe("planMove", () => {
  // [a, b, c] at the top level — the list as the learner sees it.
  const list = [
    row("a", { position: 0 }),
    row("b", { position: 1 }),
    row("c", { position: 2 }),
  ];

  it("accounts for the dragged row still being in the list it came from", () => {
    // Dropping the first row into the gap before "c" is index 2 on screen, but
    // index 1 once "a" is lifted out. Without the adjustment it lands last.
    const plan = planMove("a", null, 2, list)!;
    expect(plan.moved.position).toBe(1);
    expect(plan.resorted).toEqual([{ id: "b", position: 0 }]);
  });

  it("treats a drop into the gap just above a row as a no-op, not a shuffle", () => {
    const plan = planMove("a", null, 1, list)!;
    expect(plan.moved.position).toBe(0);
    expect(plan.resorted).toEqual([]);
  });

  it("sends a row to the end when dropped in the final gap", () => {
    const plan = planMove("a", null, 3, list)!;
    expect(plan.moved.position).toBe(2);
    expect(plan.resorted).toEqual([{ id: "b", position: 0 }, { id: "c", position: 1 }]);
  });

  it("does NOT adjust the index when the row comes from a different parent", () => {
    const rows = [
      row("folder", { is_group: true, position: 0 }),
      row("x", { parent_id: "folder", position: 0 }),
      ...list,
    ];
    // Straight insert at slot 1: nothing of "x" was occupying the target list.
    const plan = planMove("x", null, 1, rows)!;
    expect(plan.moved).toEqual({ id: "x", parent_id: null, position: 1 });
  });

  it("clamps an out-of-range index, so 'drop onto a folder' can just ask for the end", () => {
    const rows = [row("folder", { is_group: true }), row("a"), row("b")];
    const plan = planMove("a", "folder", Number.MAX_SAFE_INTEGER, rows)!;
    expect(plan.moved).toEqual({ id: "a", parent_id: "folder", position: 0 });
  });

  it("renumbers only the siblings that actually shifted", () => {
    const plan = planMove("c", null, 0, list)!;
    expect(plan.moved.position).toBe(0);
    expect(plan.resorted).toEqual([{ id: "a", position: 1 }, { id: "b", position: 2 }]);
  });

  it("keeps a page's sibling list to its own notebook", () => {
    const rows = [
      row("p1", { notebook_id: "book", position: 0 }),
      row("p2", { notebook_id: "book", position: 1 }),
      row("other", { notebook_id: "elsewhere", position: 0 }),
    ];
    const plan = planMove("p2", null, 0, rows)!;
    expect(plan.moved.position).toBe(0);
    // A page in another notebook is not a sibling and must not be renumbered.
    expect(plan.resorted).toEqual([{ id: "p1", position: 1 }]);
  });

  it("returns null for a row that has gone", () => {
    expect(planMove("ghost", null, 0, list)).toBeNull();
  });
});

describe("planDissolve", () => {
  it("splices the folder's contents into the slot it occupied, preserving the visible order", () => {
    const rows = [
      row("before", { position: 0 }),
      row("folder", { position: 1, is_group: true }),
      row("after", { position: 2 }),
      row("x", { parent_id: "folder", position: 0 }),
      row("y", { parent_id: "folder", position: 1 }),
    ];
    const plan = planDissolve("folder", rows)!;
    expect(plan.lifted).toEqual([
      { id: "x", parent_id: null, position: 1 },
      { id: "y", parent_id: null, position: 2 },
    ]);
    // "after" is pushed down to make room for the two lifted rows.
    expect(plan.resorted).toEqual([{ id: "after", position: 3 }]);
  });

  it("lifts a child whose index happens not to change — otherwise the cascade would delete it", () => {
    const rows = [
      row("folder", { position: 0, is_group: true }),
      row("only", { parent_id: "folder", position: 0 }),
    ];
    const plan = planDissolve("folder", rows)!;
    // Index 0 either way, but it still has to be re-parented off the folder.
    expect(plan.lifted).toEqual([{ id: "only", parent_id: null, position: 0 }]);
  });

  it("lifts children back into the folder's own parent, not to the root", () => {
    const rows = [
      row("outer", { is_group: true }),
      row("inner", { parent_id: "outer", is_group: true, position: 0 }),
      row("leaf", { parent_id: "inner", position: 0 }),
    ];
    expect(planDissolve("inner", rows)!.lifted).toEqual([
      { id: "leaf", parent_id: "outer", position: 0 },
    ]);
  });

  it("keeps a page group's contents within the same notebook's sibling list", () => {
    const rows = [
      row("g", { notebook_id: "book", position: 0, is_group: true }),
      row("p", { notebook_id: "book", parent_id: "g", position: 0 }),
      row("elsewhere", { notebook_id: "other", position: 0 }),
    ];
    const plan = planDissolve("g", rows)!;
    expect(plan.lifted).toEqual([{ id: "p", parent_id: null, position: 0 }]);
    // A page in a different notebook is not a sibling and must not be renumbered.
    expect(plan.resorted).toEqual([]);
  });

  it("refuses anything that isn't a folder", () => {
    expect(planDissolve("plain", [row("plain")])).toBeNull();
  });
});

// ── reindex ──────────────────────────────────────────────────────────────────

describe("reindex", () => {
  it("returns only the rows that actually moved, so a drop writes two rows and not the branch", () => {
    const rows = [
      { id: "a", position: 1 },
      { id: "b", position: 0 },
      { id: "c", position: 2 },
    ];
    expect(reindex(rows)).toEqual([{ id: "a", position: 0 }, { id: "b", position: 1 }]);
  });

  it("returns nothing when the order is already correct", () => {
    expect(reindex([{ id: "a", position: 0 }, { id: "b", position: 1 }])).toEqual([]);
  });
});
