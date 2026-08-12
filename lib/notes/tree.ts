import type {
  BaggedItem, Note, NoteNode, Notebook, NotebookNode, NotesTree, NotesTreePayload,
} from "@/types";

// ── The Notes tree: nesting, grouping rules, ordering ────────────────────────
// Everything here is pure — no React, no network, no Supabase — so the fiddly
// parts (who may be grouped with whom, where a drag may land, what the Bag
// swallows) are unit-testable on plain objects. The API layer calls the same
// `can*` guards before it writes, so the UI and the server never disagree about
// what is legal.
//
// The two levels of the tree have the same shape: rows carry `parent_id` +
// `is_group`, containers hold children, content rows are leaves. Notebooks nest
// among notebooks; pages nest among pages inside one notebook. The one rule
// that differs is that a page can never cross into another notebook.

// Indentation stops growing past this depth — the sidebar is 256px wide and a
// deep chain would otherwise squeeze labels to nothing. Nesting itself is
// unlimited; only the visual inset is capped.
export const INDENT_CAP = 5;

export type TreeKind = "notebook" | "note";

export type Check = { ok: true } | { ok: false; reason: string };

const ok: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

// The minimum a row must expose for the grouping/moving guards. Both Notebook
// and Note satisfy it, so callers can pass real rows straight through.
export interface TreeItem {
  id:           string;
  kind:         TreeKind;
  parent_id:    string | null;
  is_group:     boolean;
  notebook_id?: string; // pages only — the notebook a page is bounded by
}

// ── Building the nested tree ─────────────────────────────────────────────────

interface Nestable {
  id:         string;
  parent_id:  string | null;
  position:   number;
  created_at: string;
  bagged_at:  string | null;
}

// Siblings order by `position`, with created_at as a stable tie-break so rows
// that share a position (e.g. straight after an insert) never jitter.
function bySortOrder(a: Nestable, b: Nestable): number {
  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Nest a flat list of rows into a forest, lifting bagged branches out of it.
 *
 * `build` turns one row plus its already-built children into a node, so the
 * same walk serves both notebooks (which also carry a page tree) and pages.
 *
 * Two deliberate robustness choices: a row whose parent has vanished is treated
 * as a root rather than silently dropped, and the walk only ever descends from
 * the roots — so a corrupt parent chain that forms a cycle makes those rows
 * invisible instead of hanging the render.
 */
function assemble<T extends Nestable, N>(
  rows: T[],
  build: (row: T, children: N[], depth: number) => N,
): { roots: N[]; bagged: N[] } {
  const known = new Set(rows.map((r) => r.id));
  const byParent = new Map<string | null, T[]>();
  for (const row of rows) {
    const parent = row.parent_id && known.has(row.parent_id) ? row.parent_id : null;
    push(byParent, parent, row);
  }
  for (const list of byParent.values()) list.sort(bySortOrder);

  const bagged: N[] = [];
  const seen = new Set<string>();

  // `insideBag` stops a bagged row nested inside an already-bagged branch from
  // being listed a second time: once a branch is in the Bag it travels whole.
  function collect(parent: string | null, depth: number, insideBag: boolean): N[] {
    const out: N[] = [];
    for (const row of byParent.get(parent) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if (row.bagged_at && !insideBag) {
        bagged.push(build(row, collect(row.id, 1, true), 0));
      } else {
        out.push(build(row, collect(row.id, depth + 1, insideBag), depth));
      }
    }
    return out;
  }

  return { roots: collect(null, 0, false), bagged };
}

/**
 * Flat rows → the tree the workspace renders, plus the Bag's contents.
 *
 * Pages are nested per notebook, so a page group is always wholly inside one
 * notebook. Bagged pages only reach the Bag drawer if their notebook is itself
 * visible — a bagged notebook takes its pages down with it as one entry.
 */
export function buildTree(payload: NotesTreePayload): NotesTree {
  const notesByNotebook = new Map<string, Note[]>();
  for (const note of payload.notes) push(notesByNotebook, note.notebook_id, note);

  const baggedNotesByNotebook = new Map<string, NoteNode[]>();

  const notebookTree = assemble<Notebook, NotebookNode>(
    payload.notebooks,
    (row, children, depth) => {
      const pages = assemble<Note, NoteNode>(
        notesByNotebook.get(row.id) ?? [],
        (n, kids, d) => ({ ...n, children: kids, depth: d }),
      );
      if (pages.bagged.length > 0) baggedNotesByNotebook.set(row.id, pages.bagged);
      return { ...row, children, notes: pages.roots, depth };
    },
  );

  // Only notebooks still on screen contribute their bagged pages to the drawer.
  const visible = new Map<string, NotebookNode>();
  (function walk(nodes: NotebookNode[]) {
    for (const nb of nodes) {
      visible.set(nb.id, nb);
      walk(nb.children);
    }
  })(notebookTree.roots);

  const bagged: BaggedItem[] = notebookTree.bagged.map((node) => ({ kind: "notebook", node }));
  for (const [notebookId, nodes] of baggedNotesByNotebook) {
    const notebook = visible.get(notebookId);
    if (!notebook) continue;
    for (const node of nodes) {
      bagged.push({ kind: "note", node, notebook_id: notebookId, notebook_title: notebook.title });
    }
  }

  return { roots: notebookTree.roots, bagged };
}

// ── Which ancestors to expand ────────────────────────────────────────────────

/**
 * Every id that must be expanded for `noteId` to be on screen: its notebook,
 * that notebook's ancestor folders, and any page groups it sits inside.
 * Returns an empty set if the page isn't in the visible tree (bagged, deleted,
 * or from a stale localStorage entry) — the caller just opens collapsed.
 */
export function pathTo(tree: NotesTree, noteId: string): Set<string> {
  const path = new Set<string>();

  function inPages(nodes: NoteNode[], trail: string[]): boolean {
    for (const node of nodes) {
      if (node.id === noteId) {
        for (const id of trail) path.add(id);
        return true;
      }
      if (inPages(node.children, [...trail, node.id])) return true;
    }
    return false;
  }

  function inNotebooks(nodes: NotebookNode[], trail: string[]): boolean {
    for (const nb of nodes) {
      if (inPages(nb.notes, [...trail, nb.id])) return true;
      if (inNotebooks(nb.children, [...trail, nb.id])) return true;
    }
    return false;
  }

  inNotebooks(tree.roots, []);
  return path;
}

// ── Guards ───────────────────────────────────────────────────────────────────

function indexItems(items: TreeItem[]): Map<string, TreeItem> {
  return new Map(items.map((i) => [i.id, i]));
}

// Walks up from `id`. Stops on a missing or repeated parent, so a corrupt chain
// yields a short answer rather than looping forever.
function ancestorsOf(id: string, byId: Map<string, TreeItem>): Set<string> {
  const out = new Set<string>();
  let cur = byId.get(id)?.parent_id ?? null;
  while (cur && !out.has(cur)) {
    out.add(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return out;
}

/**
 * May these rows be wrapped in a new folder together?
 *
 * Rejections carry the sentence shown in the disabled Group button's tooltip,
 * so the UI never has to invent its own wording.
 */
export function canGroup(ids: string[], items: TreeItem[]): Check {
  const byId = indexItems(items);
  const rows = ids.map((id) => byId.get(id)).filter((r): r is TreeItem => !!r);
  if (rows.length !== ids.length) return no("Some of that selection no longer exists.");
  if (rows.length < 2) return no("Pick at least two things to group.");

  const kinds = new Set(rows.map((r) => r.kind));
  if (kinds.size > 1) return no("A page can't be grouped with a notebook — pages stay inside their notebook.");

  if (rows[0].kind === "note") {
    const notebooks = new Set(rows.map((r) => r.notebook_id));
    if (notebooks.size > 1) return no("Those pages live in different notebooks. Pages can only be grouped within one notebook.");
  }

  // Selecting a folder together with something already inside it is almost
  // always a mis-click, and honouring it would pull the child out of the folder
  // it is sitting in. Refuse rather than quietly rearrange.
  const selected = new Set(ids);
  for (const row of rows) {
    for (const ancestor of ancestorsOf(row.id, byId)) {
      if (selected.has(ancestor)) return no("That selection includes a folder and something already inside it.");
    }
  }

  return ok;
}

/**
 * May `dragId` be dropped into `targetParentId` (null = the top level)?
 *
 * Enforces the four things that must never happen: dropping something into
 * itself or its own descendant, using a content row as a container, mixing the
 * two levels of the tree, and moving a page out of its notebook.
 *
 * `targetNotebookId` matters only for top-level page drops. Every notebook's
 * page list has parent_id null, so without it a page dragged onto a DIFFERENT
 * notebook's top-level gap would pass the guard and then quietly land back in
 * its own notebook.
 */
export function canMove(
  dragId: string,
  targetParentId: string | null,
  items: TreeItem[],
  targetNotebookId?: string,
): Check {
  const byId = indexItems(items);
  const dragged = byId.get(dragId);
  if (!dragged) return no("That item no longer exists.");

  // parent_id null means the top level: the sidebar root for a notebook, or the
  // notebook's own page list for a page. Legal, as long as a page isn't being
  // dropped into some other notebook's list.
  if (targetParentId === null) {
    if (dragged.kind === "note" && targetNotebookId && dragged.notebook_id !== targetNotebookId) {
      return no("Pages can't move to another notebook.");
    }
    return ok;
  }

  if (targetParentId === dragId) return no("Can't drop something into itself.");

  const target = byId.get(targetParentId);
  if (!target) return no("That destination no longer exists.");
  if (!target.is_group) return no("Only folders can hold other items.");
  if (target.kind !== dragged.kind) {
    return no("A page can't go inside a notebook folder — pages stay inside their notebook.");
  }
  if (ancestorsOf(targetParentId, byId).has(dragId)) {
    return no("Can't move a folder inside itself.");
  }
  if (dragged.kind === "note" && dragged.notebook_id !== target.notebook_id) {
    return no("Pages can't move to another notebook.");
  }

  return ok;
}

// ── Planning a group / a dissolve ────────────────────────────────────────────
// The API executes these; they decide *where things end up*, which is the part
// most easily got wrong and least visible when it is. Both take the owner's
// full row set for one level of the tree and return only what must be written.

export interface PositionedRow {
  id:           string;
  parent_id:    string | null;
  position:     number;
  created_at:   string;
  is_group:     boolean;
  notebook_id?: string;
}

export interface GroupPlan {
  parent_id:    string | null;
  position:     number;
  notebook_id?: string;
  members:      Array<{ id: string; position: number }>;
}

export interface DissolvePlan {
  lifted:   Array<{ id: string; parent_id: string | null; position: number }>;
  resorted: Array<{ id: string; position: number }>;
}

export interface MovePlan {
  moved:    { id: string; parent_id: string | null; position: number };
  resorted: Array<{ id: string; position: number }>;
}

// Siblings share a parent — and, for pages, a notebook, since a page tree never
// crosses notebooks.
function siblingsOf<T extends PositionedRow>(rows: T[], row: T): T[] {
  return rows
    .filter((r) => r.parent_id === row.parent_id && r.notebook_id === row.notebook_id)
    .sort(byPosition);
}

function byPosition(a: PositionedRow, b: PositionedRow): number {
  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}

// How far from the top a row sits, with the same cycle guard as ancestorsOf.
function depthOf(id: string, byId: Map<string, PositionedRow>): number {
  let depth = 0;
  let cursor = byId.get(id)?.parent_id ?? null;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    depth++;
    cursor = byId.get(cursor)?.parent_id ?? null;
  }
  return depth;
}

/**
 * Where a new folder goes, and in what order its members sit inside it.
 *
 * The folder takes the place of the SHALLOWEST thing selected, so grouping a
 * top-level notebook with a deeply nested one forms the folder at the top
 * rather than burying it. Members keep the relative order they already had —
 * click order is how you picked them, not how you want to read them.
 *
 * Returns null if any id has gone missing; run `canGroup` first for the reason.
 */
export function planGroup(ids: string[], rows: PositionedRow[]): GroupPlan | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const selected = ids.map((id) => byId.get(id)).filter((r): r is PositionedRow => !!r);
  if (selected.length !== ids.length || selected.length < 2) return null;

  const anchor = selected.reduce((best, row) => {
    const d = depthOf(row.id, byId);
    const bestDepth = depthOf(best.id, byId);
    if (d !== bestDepth) return d < bestDepth ? row : best;
    return byPosition(row, best) < 0 ? row : best;
  }, selected[0]);

  return {
    parent_id:   anchor.parent_id,
    position:    anchor.position,
    notebook_id: anchor.notebook_id,
    members:     [...selected].sort(byPosition).map((r, i) => ({ id: r.id, position: i })),
  };
}

/**
 * What moves when a folder is dissolved.
 *
 * Its contents are spliced into the slot the folder occupied and the whole
 * sibling list is renumbered, so dissolving leaves the order the learner was
 * looking at intact. Every child is returned in `lifted` — including ones whose
 * index happens not to change — because all of them still need re-parenting or
 * they would be cascade-deleted with the folder.
 */
export function planDissolve(groupId: string, rows: PositionedRow[]): DissolvePlan | null {
  const group = rows.find((r) => r.id === groupId);
  if (!group || !group.is_group) return null;

  const children = rows.filter((r) => r.parent_id === group.id).sort(byPosition);
  const siblings = siblingsOf(rows, group);
  const at = siblings.findIndex((r) => r.id === group.id);
  const merged = [...siblings.slice(0, at), ...children, ...siblings.slice(at + 1)];

  const isChild = new Set(children.map((c) => c.id));
  const lifted: DissolvePlan["lifted"] = [];
  const resorted: DissolvePlan["resorted"] = [];
  merged.forEach((row, i) => {
    if (isChild.has(row.id)) lifted.push({ id: row.id, parent_id: group.parent_id, position: i });
    else if (row.position !== i) resorted.push({ id: row.id, position: i });
  });

  return { lifted, resorted };
}

/**
 * Where a dragged row lands, and which siblings shift to make room.
 *
 * `index` is the slot in the list AS DISPLAYED — the gap the learner dropped
 * into, counting the dragged row itself when it is already in that list. That
 * off-by-one is the whole subtlety here: dragging the first of [A, B, C] into
 * the gap before C is index 2 on screen but index 1 once A is taken out, and
 * getting it wrong sends the row one slot too far every time.
 *
 * Returns null if the row has gone; run `canMove` first for the reason.
 */
export function planMove(
  id: string,
  parentId: string | null,
  index: number,
  rows: PositionedRow[],
): MovePlan | null {
  const row = rows.find((r) => r.id === id);
  if (!row) return null;

  const siblings = rows
    .filter((r) => r.id !== id && r.parent_id === parentId && r.notebook_id === row.notebook_id)
    .sort(byPosition);

  let at = index;
  if (row.parent_id === parentId) {
    const displayed = rows
      .filter((r) => r.parent_id === parentId && r.notebook_id === row.notebook_id)
      .sort(byPosition);
    const from = displayed.findIndex((r) => r.id === id);
    if (from > -1 && from < index) at -= 1;
  }
  at = Math.max(0, Math.min(at, siblings.length));

  const merged = [...siblings.slice(0, at), row, ...siblings.slice(at)];
  const resorted: MovePlan["resorted"] = [];
  merged.forEach((r, i) => {
    if (r.id !== id && r.position !== i) resorted.push({ id: r.id, position: i });
  });

  return { moved: { id, parent_id: parentId, position: at }, resorted };
}

// ── Ordering ─────────────────────────────────────────────────────────────────

/**
 * Renumber a sibling list 0..n-1 after a drop, returning only the rows whose
 * position actually changed — so a reorder writes two or three rows, not the
 * whole branch.
 */
export function reindex<T extends { id: string; position: number }>(
  ordered: T[],
): Array<{ id: string; position: number }> {
  const changed: Array<{ id: string; position: number }> = [];
  ordered.forEach((row, i) => {
    if (row.position !== i) changed.push({ id: row.id, position: i });
  });
  return changed;
}
