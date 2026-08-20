"use client";

import { useState } from "react";
import { EFFORT_SWATCHES } from "@/components/ui/CalendarHeatmap";
import { EFFORT_MAX } from "@/lib/calendar";

// Five segments, 1 (subpar) to 5 (intensive). Clicking segment N logs a session
// at that effort — one click, just aimed, so rating a session costs no more than
// ticking it did. That matters: the moment recording the day takes two actions,
// the honest record becomes harder to keep than the flattering one.
//
// The segments use the heatmap's own shades, so the control and the cell it
// produces are visibly the same scale rather than two things to learn.

const STEPS = Array.from({ length: EFFORT_MAX }, (_, i) => i + 1);

/** Said out loud on hover and to a screen reader — the scale needs words, not just five boxes. */
export const EFFORT_WORDS: Record<number, string> = {
  1: "subpar",
  2: "light",
  3: "steady",
  4: "hard",
  5: "intensive",
};

interface Props {
  /** Filled segments, 0-5. */
  value:    number;
  busy?:    boolean;
  /** Names the thing being rated, for the button labels. */
  subject:  string;
  onPick:   (effort: number) => void;
  /** Taller segments for the diary, where the control stands alone. */
  size?:    "sm" | "md";
  /**
   * The segment that means "clear this", if any — set it where the control
   * edits something already on the record, leave it off where the control is
   * only filling in a form. Clicking a rating you have already given is the
   * natural way to take it back, and without it the only way down from a
   * mis-click is to delete the entry outright.
   */
  clearAt?: number | null;
}

export default function EffortPicker({
  value, busy = false, subject, onPick, size = "sm", clearAt = null,
}: Props) {
  // Hovering previews what clicking would record, so the scale can be read by
  // trying it rather than by consulting a legend.
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  const dims = size === "md" ? "h-5 w-2.5" : "h-4 w-1.5";

  const words = (n: number) =>
    n === clearAt ? `clear — currently ${n}, ${EFFORT_WORDS[n]}` : `${n} — ${EFFORT_WORDS[n]}`;

  return (
    <div
      className="flex shrink-0 items-center gap-[2px]"
      onMouseLeave={() => setHover(0)}
      role="group"
      aria-label={`Effort for ${subject}`}
    >
      {STEPS.map(n => (
        <button
          key={n}
          type="button"
          disabled={busy}
          onMouseEnter={() => setHover(n)}
          onClick={e => { e.stopPropagation(); onPick(n); }}
          title={words(n)}
          aria-label={
            n === clearAt
              ? `Clear the effort rating for ${subject}`
              : `Log ${subject} at effort ${n}, ${EFFORT_WORDS[n]}`
          }
          className={`${dims} rounded-[2px] transition-colors disabled:cursor-not-allowed ${
            n <= shown ? EFFORT_SWATCHES[n] : "bg-slate-800 hover:bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}
