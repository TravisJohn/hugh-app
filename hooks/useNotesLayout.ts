"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  fitToContainer, resizePane, togglePane, type NotesLayout, type PaneId,
} from "@/lib/notes/layout";
import {
  getLayoutSnapshot, getServerLayoutSnapshot, subscribeLayout, updateLayout,
} from "@/lib/notes/layoutStore";

// How far an arrow key nudges a divider — a visible step without being a jump,
// so the dividers are usable without a pointer.
const KEY_STEP = 24;

export interface NotesLayoutApi {
  layout:       NotesLayout;
  /** Callback ref for the element the pane widths are measured against. */
  attachContainer: (el: HTMLDivElement | null) => void;
  toggle:       (pane: PaneId) => void;
  /** Begin a divider drag; the hook owns the move/up listeners. */
  beginDrag:    (pane: "tree" | "thread") => void;
  /** Arrow-key resize: +1 grows the pane, -1 shrinks it. */
  nudge:        (pane: "tree" | "thread", delta: number) => void;
  dragging:     "tree" | "thread" | null;
}

// Owns the Notes workspace layout: two resizable side panes, three collapsible
// panes, remembered in this browser. Kept apart from `useNotes` on purpose —
// nothing here touches notes data, so moving a divider never re-fetches
// anything. The layout itself lives in `layoutStore`, backed by localStorage.
export function useNotesLayout(): NotesLayoutApi {
  const layout = useSyncExternalStore(subscribeLayout, getLayoutSnapshot, getServerLayoutSnapshot);
  const [dragging, setDragging] = useState<"tree" | "thread" | null>(null);
  // A callback ref rather than a `useRef`, so the observer effect below runs the
  // moment the element exists instead of guessing at mount order.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const width = useCallback(
    () => container?.getBoundingClientRect().width ?? 0,
    [container],
  );

  // A layout saved on a wide monitor has to survive being opened narrow.
  useEffect(() => {
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      updateLayout((prev) => fitToContainer(prev, container.getBoundingClientRect().width));
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  const toggle = useCallback((pane: PaneId) => {
    updateLayout((prev) => togglePane(prev, pane, width()));
  }, [width]);

  const nudge = useCallback((pane: "tree" | "thread", delta: number) => {
    updateLayout((prev) => {
      const current = pane === "tree" ? prev.treeWidth : prev.threadWidth;
      return resizePane(prev, pane, current + delta * KEY_STEP, width());
    });
  }, [width]);

  const beginDrag = useCallback((pane: "tree" | "thread") => {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // The pointer may leave the divider — even the window — mid-drag, so the
    // listeners live on the document, and the width is derived from the
    // container edge rather than from a delta that could drift.
    const widthAt = (x: number) => (pane === "tree" ? x - rect.left : rect.right - x);

    setDragging(pane);
    // Suppress text selection and hold the resize cursor for the whole drag.
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(e: PointerEvent) {
      updateLayout((prev) => resizePane(prev, pane, widthAt(e.clientX), rect.width));
    }
    function stop() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      setDragging(null);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
  }, [container]);

  return { layout, attachContainer: setContainer, toggle, beginDrag, nudge, dragging };
}
