"use client";

import type { KeyboardEvent, PointerEvent } from "react";

interface Props {
  /** Which pane this divider resizes — the one it borders on its fixed side. */
  pane:      "tree" | "thread";
  label:     string;
  width:     number;
  active:    boolean;
  onBegin:   (pane: "tree" | "thread") => void;
  onNudge:   (pane: "tree" | "thread", delta: number) => void;
}

// A draggable seam between two panes. It is 5px of hit area around a 1px line —
// wide enough to grab without looking, thin enough that it reads as a border
// rather than a third thing on screen. Dragging a pane far past its minimum
// hides it (see `resizePane`), so the seam and the rails are one gesture.
export default function PaneDivider({ pane, label, width, active, onBegin, onNudge }: Props) {
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    onBegin(pane);
  }

  // Arrows move the divider in screen terms; the pane grows when you push the
  // seam away from it, which is the opposite key for each side.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const grow = pane === "tree" ? "ArrowRight" : "ArrowLeft";
    const shrink = pane === "tree" ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow) { e.preventDefault(); onNudge(pane, 1); }
    if (e.key === shrink) { e.preventDefault(); onNudge(pane, -1); }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`group relative w-[5px] shrink-0 cursor-col-resize touch-none outline-none
        ${active ? "bg-sky-500/40" : "hover:bg-sky-500/25 focus-visible:bg-sky-500/40"}`}
    >
      {/* The hairline the panes actually appear to be separated by. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2
          ${active ? "bg-sky-400" : "bg-slate-800 group-hover:bg-sky-500/60"}`}
      />
    </div>
  );
}
