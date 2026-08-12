"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Briefcase, Undo2, Folder, Book, FileText } from "lucide-react";
import type { TreeKind } from "@/lib/notes/tree";
import type { BaggedItem } from "@/types";

interface Props {
  items:   BaggedItem[];
  onUnbag: (kind: TreeKind, id: string) => void;
}

// Pinned at the foot of the sidebar: things tucked out of the way for a clean
// workspace. Nothing here is deleted — a bagged folder or notebook keeps its
// whole subtree, which is why the drawer lists one entry per bagged thing and
// not one per page inside it.
//
// Renders nothing at all when the Bag is empty: an always-visible empty drawer
// would be exactly the clutter this feature exists to remove.
export default function BagDrawer({ items, onUnbag }: Props) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-slate-800 bg-[#0B1120]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-500 transition-colors hover:text-slate-300"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Briefcase size={13} />
        <span className="font-medium">Bag</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{items.length}</span>
      </button>

      {open && (
        <div className="max-h-48 overflow-y-auto px-2 pb-2">
          {items.map((item) => {
            const isNotebook = item.kind === "notebook";
            const label = isNotebook
              ? null
              : `from ${item.notebook_title}`;
            return (
              <div
                key={item.node.id}
                className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-slate-800/60"
              >
                {isNotebook
                  ? (item.node.is_group
                      ? <Folder size={12} className="shrink-0 text-amber-500/70" />
                      : <Book size={12} className="shrink-0 text-slate-500" />)
                  : <FileText size={12} className="shrink-0 text-slate-500" />}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-300">{item.node.title}</span>
                  {label && <span className="block truncate text-[10px] text-slate-600">{label}</span>}
                </span>

                <button
                  type="button"
                  onClick={() => onUnbag(item.kind, item.node.id)}
                  title="Put back where it was"
                  className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-sky-400 group-hover:opacity-100"
                >
                  <Undo2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
