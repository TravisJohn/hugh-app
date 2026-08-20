"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Check, Loader2, PencilLine } from "lucide-react";
import { MARGIN_BODY_MAX } from "@/lib/margin/notes";
import { useMargin } from "./MarginProvider";

// The pad: a textarea that saves. That is the whole feature, and keeping it
// that plain is the point — this stands in for reaching across the desk for a
// physical notebook, so anything that makes it feel like an app makes it worse.
//
// The one thing it must never do is lose a sentence. Paper doesn't, so the save
// state is always on screen: saving, saved, or a failure you can retry. A silent
// autosave that quietly stopped working would be worse than no pad at all.

/** Markdown is rendered in the review list, so the hint has to be honest about it. */
const PLACEHOLDER =
  "What do you want to remember from this page?\n\nYour words, not the page's. Markdown works.";

export default function MarginPad({ label }: { label: string }) {
  const { body, status, error, setBody, flush, focusNonce } = useMargin();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Something outside the pad asked for it — a section heading's ＋. Take focus
  // and put the caret at the end, where the stub just landed.
  useEffect(() => {
    if (focusNonce === 0) return;
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    area.scrollTop = area.scrollHeight;
  }, [focusNonce]);

  const nearCap = body.length > MARGIN_BODY_MAX * 0.9;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-300">
          <PencilLine size={14} className="text-slate-500" />
          Your notes
        </h2>
        <span className="ml-auto truncate text-[11px] text-slate-600">{label}</span>
      </div>

      <textarea
        ref={areaRef}
        value={body}
        onChange={e => setBody(e.target.value)}
        onBlur={flush}
        maxLength={MARGIN_BODY_MAX}
        placeholder={PLACEHOLDER}
        // The one pane on this page that scrolls internally. The write-up beside
        // it scrolls the page; the pad is docked and sticky, so it has to hold
        // its own height or it would drag the rail past the viewport.
        className="h-72 w-full resize-none overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-600"
      />

      <div className="mt-2 flex min-h-[18px] items-center gap-1.5 text-[11px]">
        <SaveState status={status} error={error} onRetry={flush} />
        {nearCap && (
          <span className="ml-auto tabular-nums text-amber-400/80">
            {body.length.toLocaleString()}/{MARGIN_BODY_MAX.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The save state, said plainly. `idle` renders nothing — an untouched pad has
 * nothing to report, and "saved" on a note you never wrote would be noise.
 */
function SaveState({ status, error, onRetry }: {
  status: string;
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-red-400">
        <AlertTriangle size={12} />
        {error ?? "Couldn't save."}
        <button
          type="button"
          onClick={onRetry}
          className="rounded px-1.5 py-0.5 font-semibold text-red-300 underline-offset-2 hover:underline"
        >
          Retry
        </button>
      </span>
    );
  }

  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Saving…
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-slate-600">
        <Check size={12} /> Saved
      </span>
    );
  }

  if (status === "dirty") {
    return <span className="text-slate-600">Unsaved…</span>;
  }

  return null;
}
