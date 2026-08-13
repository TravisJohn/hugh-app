import { describe, it, expect } from "vitest";
import {
  DEFAULT_LAYOUT, PANE_MAX, PANE_MIN, RAIL_WIDTH, SNAP_SLACK,
  fillerPane, fitToContainer, maxWidthFor, parseLayout, resizePane, serializeLayout, togglePane,
  type NotesLayout,
} from "./layout";

// A roomy container, so tests that are about the min/max rules aren't
// accidentally about running out of screen.
const WIDE = 1920;

function layout(over: Partial<NotesLayout> = {}): NotesLayout {
  return { ...DEFAULT_LAYOUT, ...over, hidden: { ...DEFAULT_LAYOUT.hidden, ...over.hidden } };
}

describe("resizePane", () => {
  it("applies a width that sits between the pane's minimum and maximum", () => {
    expect(resizePane(layout(), "tree", 300, WIDE).treeWidth).toBe(300);
  });

  it("clamps a drag past the maximum instead of letting a side pane take the screen", () => {
    expect(resizePane(layout(), "thread", 5000, WIDE).threadWidth).toBe(PANE_MAX.thread);
  });

  it("clamps a small drag to the minimum, so a near-miss resizes rather than hides", () => {
    const nearMiss = PANE_MIN.tree - SNAP_SLACK + 1;
    const next = resizePane(layout(), "tree", nearMiss, WIDE);
    expect(next.treeWidth).toBe(PANE_MIN.tree);
    expect(next.hidden.tree).toBe(false);
  });

  it("hides the pane once the drag passes the minimum by more than the snap slack", () => {
    const next = resizePane(layout(), "tree", PANE_MIN.tree - SNAP_SLACK - 1, WIDE);
    expect(next.hidden.tree).toBe(true);
  });

  it("keeps the last hidden width, so re-showing the pane restores its size", () => {
    const sized = resizePane(layout(), "thread", 500, WIDE);
    const hiddenNow = resizePane(sized, "thread", 0, WIDE);
    expect(hiddenNow.threadWidth).toBe(500);
  });

  it("never squeezes the screenshot pane below its minimum on a narrow window", () => {
    const narrow = 900;
    const next = resizePane(layout({ threadWidth: 320 }), "tree", 480, narrow);
    const remaining = narrow - next.treeWidth - next.threadWidth;
    expect(remaining).toBeGreaterThanOrEqual(PANE_MIN.images);
  });

  it("gives a side pane the room a hidden neighbour freed up", () => {
    // 900px is narrow enough that neither result runs into the tree's hard cap,
    // so the difference is purely what hiding the screenshots handed back.
    const withImages = maxWidthFor(layout(), "tree", 900);
    const withoutImages = maxWidthFor(layout({ hidden: { ...DEFAULT_LAYOUT.hidden, images: true } }), "tree", 900);
    expect(withoutImages - withImages).toBe(PANE_MIN.images - RAIL_WIDTH);
  });

  it("falls back to the static cap before the container has been measured", () => {
    expect(maxWidthFor(layout(), "tree", 0)).toBe(PANE_MAX.tree);
  });
});

describe("togglePane", () => {
  it("hides a visible pane and shows a hidden one", () => {
    const hiddenNow = togglePane(layout(), "images", WIDE);
    expect(hiddenNow.hidden.images).toBe(true);
    expect(togglePane(hiddenNow, "images", WIDE).hidden.images).toBe(false);
  });

  it("shrinks a restored pane that no longer fits the current window", () => {
    const wideThread = layout({ threadWidth: PANE_MAX.thread, hidden: { ...DEFAULT_LAYOUT.hidden, thread: true } });
    const shown = togglePane(wideThread, "thread", 900);
    expect(shown.threadWidth).toBeLessThan(PANE_MAX.thread);
    expect(shown.threadWidth).toBeGreaterThanOrEqual(PANE_MIN.thread);
  });
});

describe("fillerPane", () => {
  it("gives the leftover space to the screenshots while they are visible", () => {
    expect(fillerPane(layout())).toBe("images");
  });

  it("hands the slack to the thread when the screenshots are hidden", () => {
    expect(fillerPane(layout({ hidden: { tree: false, images: true, thread: false } }))).toBe("thread");
  });

  it("hands the slack to the tree when it is the only pane left", () => {
    expect(fillerPane(layout({ hidden: { tree: false, images: true, thread: true } }))).toBe("tree");
  });

  it("reports no filler when every pane is collapsed to a rail", () => {
    expect(fillerPane(layout({ hidden: { tree: true, images: true, thread: true } }))).toBeNull();
  });
});

describe("fitToContainer", () => {
  it("leaves a layout that already fits untouched", () => {
    const start = layout();
    expect(fitToContainer(start, WIDE)).toEqual(start);
  });

  it("re-clamps a saved wide layout opened on a narrow window", () => {
    const next = fitToContainer(layout({ treeWidth: 480, threadWidth: 720 }), 1000);
    expect(next.treeWidth + next.threadWidth + PANE_MIN.images).toBeLessThanOrEqual(1000);
  });

  it("ignores an unmeasured container rather than collapsing everything to minimums", () => {
    const start = layout({ treeWidth: 400 });
    expect(fitToContainer(start, 0)).toEqual(start);
  });
});

describe("parseLayout", () => {
  it("round-trips a serialized layout", () => {
    const start = layout({ treeWidth: 300, hidden: { tree: false, images: false, thread: true } });
    expect(parseLayout(serializeLayout(start))).toEqual(start);
  });

  it("falls back to the default when nothing has been stored", () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("falls back to the default on a corrupt blob instead of throwing", () => {
    expect(parseLayout("{not json")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("[]")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("42")).toEqual(DEFAULT_LAYOUT);
  });

  it("clamps out-of-range stored widths, so a hand-edited blob can't break the layout", () => {
    const parsed = parseLayout(JSON.stringify({ treeWidth: 9999, threadWidth: -5, hidden: {} }));
    expect(parsed.treeWidth).toBe(PANE_MAX.tree);
    expect(parsed.threadWidth).toBe(PANE_MIN.thread);
  });

  it("treats non-boolean hidden flags as visible", () => {
    const parsed = parseLayout(JSON.stringify({ hidden: { tree: "yes", images: 1, thread: true } }));
    expect(parsed.hidden).toEqual({ tree: false, images: false, thread: true });
  });
});
