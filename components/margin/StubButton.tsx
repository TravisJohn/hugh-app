"use client";

import { Plus } from "lucide-react";
import { useMargin } from "./MarginProvider";

// The "pull this section into my notes" button that sits on a section heading.
//
// It exists because of when a learner gives up: facing a blank box after reading
// two thousand words is the moment the pad gets closed, and facing
// "**Gotchas** — " is the moment they write. Clicking a section you have already
// pulled in doesn't duplicate it — the pad just opens at that spot, which is
// almost always what you meant.

export default function StubButton({ heading }: { heading: string }) {
  const { insertStub, requestFocus } = useMargin();

  return (
    <button
      type="button"
      onClick={() => { insertStub(heading); requestFocus(); }}
      title={`Add "${heading}" to your notes`}
      aria-label={`Add ${heading} to your notes`}
      className="rounded p-0.5 text-slate-700 opacity-0 transition-opacity hover:text-cyan-400 focus-visible:opacity-100 group-hover/section:opacity-100"
    >
      <Plus size={14} />
    </button>
  );
}
