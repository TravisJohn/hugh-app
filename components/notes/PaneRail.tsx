"use client";

import { FolderTree, Image as ImageIcon, MessageSquare } from "lucide-react";
import { RAIL_WIDTH, type PaneId } from "@/lib/notes/layout";

const RAIL: Record<PaneId, { icon: typeof FolderTree; label: string }> = {
  tree:   { icon: FolderTree,     label: "Notebooks" },
  images: { icon: ImageIcon,      label: "Screenshots" },
  thread: { icon: MessageSquare,  label: "Thread" },
};

interface Props {
  pane:     PaneId;
  side:     "left" | "right";
  onShow:   (pane: PaneId) => void;
}

// What a hidden pane leaves behind: a narrow strip carrying the pane's icon and
// its name turned on its side. Clicking it brings the pane back at the width it
// had. A hidden pane is never fully gone, so the layout can't strand you with
// no way back to a pane you collapsed.
export default function PaneRail({ pane, side, onShow }: Props) {
  const { icon: Icon, label } = RAIL[pane];

  return (
    <button
      type="button"
      onClick={() => onShow(pane)}
      title={`Show ${label.toLowerCase()}`}
      aria-label={`Show ${label.toLowerCase()}`}
      style={{ width: RAIL_WIDTH }}
      className={`flex shrink-0 flex-col items-center gap-3 bg-[#0B1120] py-3 text-slate-500
        transition-colors hover:bg-slate-900 hover:text-sky-400
        ${side === "left" ? "border-r" : "border-l"} border-slate-800`}
    >
      <Icon size={15} />
      <span className="text-[10px] font-semibold uppercase tracking-widest [writing-mode:vertical-rl]">
        {label}
      </span>
    </button>
  );
}
