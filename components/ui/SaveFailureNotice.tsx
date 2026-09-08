"use client";

import { AlertCircle } from "lucide-react";
import { type SaveFailure } from "@/lib/errors/saveOutcome";

interface Props {
  failure:   SaveFailure;
  /** What did not happen, in the learner's terms — "Card moved back", "Not saved". */
  title:     string;
  onDismiss: () => void;
}

/**
 * The one way this app tells a learner that a save was refused.
 *
 * `saveOutcome.ts` decides *what* to say; this decides what that looks like.
 * The board and the milestone panel both need it and were about to grow a copy
 * each, which is how two screens end up disagreeing about how serious the same
 * refusal is.
 *
 * Positioning is deliberately left to the caller: the board floats this over
 * the whole viewport, while the panel keeps it inside its own column so it
 * cannot cover the board behind it.
 */
export default function SaveFailureNotice({ failure, title, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="flex max-w-md items-start gap-3 rounded-2xl border border-red-500/50 bg-[#1a0505] px-5 py-4 shadow-2xl shadow-black/60 backdrop-blur-sm"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20">
        <AlertCircle size={18} className="text-red-400" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-red-300">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-red-200/80">{failure.message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 self-start rounded-lg px-2 py-1 text-xs text-red-300/70 transition-colors hover:bg-red-500/15 hover:text-red-200"
      >
        Dismiss
      </button>
    </div>
  );
}
