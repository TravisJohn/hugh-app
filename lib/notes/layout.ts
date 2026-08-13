// ── The Notes workspace layout: pane widths, collapsing, persistence ─────────
// Everything here is pure — no React, no DOM — so the fiddly parts (what a
// divider drag is allowed to do to the other two panes, when a drag becomes a
// collapse, what a corrupt localStorage blob decodes to) are unit-testable on
// plain objects. The hook layer only measures the container and calls in.
//
// The model: the side panes (tree, thread) carry pixel widths; the screenshot
// pane takes whatever is left. A hidden pane is not removed — it becomes a
// narrow rail you click to bring back, so no pane can ever be lost.

export type PaneId = "tree" | "images" | "thread";

export const PANES: readonly PaneId[] = ["tree", "images", "thread"] as const;

export interface NotesLayout {
  treeWidth:   number;
  threadWidth: number;
  hidden:      Record<PaneId, boolean>;
}

// Below these a pane stops being usable: the tree truncates every title, the
// thread can't hold a readable line of coaching, the screenshot pane shows a
// sliver of image. Drags clamp here rather than continuing.
export const PANE_MIN: Record<PaneId, number> = { tree: 180, images: 280, thread: 320 };

// Only the side panes cap — the screenshot pane is the filler and grows freely.
export const PANE_MAX: Record<"tree" | "thread", number> = { tree: 480, thread: 720 };

// The width a hidden pane leaves behind: enough for an icon and a rotated label.
export const RAIL_WIDTH = 32;

// How far past its minimum you must drag a pane before the drag is read as
// "hide this" instead of "make it as small as allowed". Wide enough that you
// can't collapse a pane by overshooting a normal resize.
export const SNAP_SLACK = 56;

export const DEFAULT_LAYOUT: NotesLayout = {
  treeWidth:   256,
  threadWidth: 420,
  hidden:      { tree: false, images: false, thread: false },
};

export const LAYOUT_STORAGE_KEY = "hugh:notes:layout:v1";

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

// The horizontal space every pane other than `pane` insists on keeping. A hidden
// neighbour only costs its rail; the screenshot pane costs its minimum because
// it absorbs the slack; the opposite side pane costs its current width.
function otherPanesFootprint(layout: NotesLayout, pane: "tree" | "thread"): number {
  const other: "tree" | "thread" = pane === "tree" ? "thread" : "tree";
  const otherWidth = other === "tree" ? layout.treeWidth : layout.threadWidth;
  return (layout.hidden[other] ? RAIL_WIDTH : otherWidth)
       + (layout.hidden.images ? RAIL_WIDTH : PANE_MIN.images);
}

// The widest `pane` may be right now. `containerWidth <= 0` means the workspace
// hasn't been measured yet (first paint, or a hidden tab), so only the static
// cap applies — guessing from a zero measurement would snap panes to their
// minimum on every mount.
export function maxWidthFor(layout: NotesLayout, pane: "tree" | "thread", containerWidth: number): number {
  const hard = PANE_MAX[pane];
  if (containerWidth <= 0) return hard;
  return Math.max(PANE_MIN[pane], Math.min(hard, containerWidth - otherPanesFootprint(layout, pane)));
}

// Apply a divider drag. Dragging a pane well below its minimum hides it, which
// is what makes the dividers and the rails one gesture instead of two features.
export function resizePane(
  layout: NotesLayout,
  pane: "tree" | "thread",
  desired: number,
  containerWidth: number,
): NotesLayout {
  if (desired < PANE_MIN[pane] - SNAP_SLACK) {
    return { ...layout, hidden: { ...layout.hidden, [pane]: true } };
  }
  const width = clamp(desired, PANE_MIN[pane], maxWidthFor(layout, pane, containerWidth));
  return pane === "tree" ? { ...layout, treeWidth: width } : { ...layout, threadWidth: width };
}

// Show/hide a pane. Re-showing restores the width it had before, clamped to what
// currently fits — a pane hidden on a wide monitor must not reappear off-screen
// on a laptop.
export function togglePane(layout: NotesLayout, pane: PaneId, containerWidth = 0): NotesLayout {
  const next: NotesLayout = { ...layout, hidden: { ...layout.hidden, [pane]: !layout.hidden[pane] } };
  if (pane === "images" || next.hidden[pane]) return next;
  return resizePane(next, pane, pane === "tree" ? next.treeWidth : next.threadWidth, containerWidth);
}

// Re-clamp both side panes — used when the window resizes under a layout that
// was saved at a different size.
export function fitToContainer(layout: NotesLayout, containerWidth: number): NotesLayout {
  if (containerWidth <= 0) return layout;
  let next = layout;
  if (!next.hidden.tree)   next = resizePane(next, "tree", next.treeWidth, containerWidth);
  if (!next.hidden.thread) next = resizePane(next, "thread", next.threadWidth, containerWidth);
  return next;
}

// Which visible pane absorbs leftover space. Normally the screenshots; when it
// is hidden the job falls to the thread, then the tree — so the workspace always
// fills the viewport instead of leaving a dead strip on the right.
export function fillerPane(layout: NotesLayout): PaneId | null {
  if (!layout.hidden.images) return "images";
  if (!layout.hidden.thread) return "thread";
  if (!layout.hidden.tree)   return "tree";
  return null;
}

// ── Persistence ──────────────────────────────────────────────────────────────
// The stored blob is user-editable and survives across deploys, so every field
// is checked and anything unrecognised falls back to the default rather than
// rendering a broken workspace.
export function parseLayout(raw: string | null | undefined): NotesLayout {
  if (!raw) return DEFAULT_LAYOUT;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (typeof data !== "object" || data === null) return DEFAULT_LAYOUT;

  const rec = data as Record<string, unknown>;
  const hiddenRec = (typeof rec.hidden === "object" && rec.hidden !== null)
    ? rec.hidden as Record<string, unknown>
    : {};

  const width = (value: unknown, pane: "tree" | "thread"): number =>
    typeof value === "number" && Number.isFinite(value)
      ? clamp(value, PANE_MIN[pane], PANE_MAX[pane])
      : (pane === "tree" ? DEFAULT_LAYOUT.treeWidth : DEFAULT_LAYOUT.threadWidth);

  return {
    treeWidth:   width(rec.treeWidth, "tree"),
    threadWidth: width(rec.threadWidth, "thread"),
    hidden: {
      tree:   hiddenRec.tree   === true,
      images: hiddenRec.images === true,
      thread: hiddenRec.thread === true,
    },
  };
}

export function serializeLayout(layout: NotesLayout): string {
  return JSON.stringify(layout);
}
