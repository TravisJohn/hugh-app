"use client";

import { Briefcase, FolderPlus, X } from "lucide-react";
import type { Check } from "@/lib/notes/tree";

interface Props {
  count:    number;
  kind:     "notebook" | "note";
  check:    Check | null;
  onGroup:  () => void;
  onBag:    () => void;
  onCancel: () => void;
}

// Floating bar at the foot of the sidebar while a Ctrl+click selection is live.
// When the selection can't be grouped the button stays visible but disabled,
// carrying the reason from lib/notes/tree — silently doing nothing would leave
// the learner to guess why (usually: a page and a notebook picked together).
export default function SelectionBar({ count, kind, check, onGroup, onBag, onCancel }: Props) {
  const blocked = check && !check.ok ? check.reason : null;
  const noun = kind === "notebook" ? "notebook" : "page";

  return (
    <div className="shrink-0 border-t border-slate-800 bg-[#0B1120] px-2 py-2">
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/70 px-2 py-1.5">
        <span className="truncate text-xs text-slate-300">
          {count} {noun}{count === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onGroup}
          disabled={!!blocked}
          title={blocked ?? "Group these into a new folder  (Ctrl+G)"}
          className="ml-auto flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          <FolderPlus size={12} /> Group
        </button>
        {/* Bagging needs no validation — anything can be tucked away, and a
            mixed selection is only a problem for grouping. */}
        <button
          type="button"
          onClick={onBag}
          title="Tuck these away into the Bag"
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
        >
          <Briefcase size={13} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          title="Clear selection  (Esc)"
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300"
        >
          <X size={13} />
        </button>
      </div>
      {blocked && <p className="px-1 pt-1.5 text-[11px] leading-snug text-slate-500">{blocked}</p>}
    </div>
  );
}
