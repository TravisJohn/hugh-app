import { RotateCcw, Zap } from "lucide-react";
import type { PackProgressSummary, PackTier } from "@/lib/code/progress";

// Where you left off in a pack. Extracted from CodeLanding so the pattern map's
// leaves can carry it too — progress (how much have I finished) and heat (how
// much have I practised lately) are different questions, and a leaf answers both.

const BADGE_STYLES: Record<PackTier, string> = {
  "not-started": "border border-dashed border-slate-700 text-slate-500",
  "in-progress": "bg-sky-500/15 text-sky-300",
  "complete": "bg-emerald-500/15 text-emerald-300",
  "owned": "bg-violet-500/15 text-violet-300",
  "review-due": "bg-amber-500/15 text-amber-300",
};

export default function PackBadge({ progress }: { progress: PackProgressSummary }) {
  const cls = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_STYLES[progress.tier]}`;
  switch (progress.tier) {
    case "not-started":
      return <span className={cls}>Not started</span>;
    case "in-progress":
      return <span className={cls}>{progress.cellsPassed}/{progress.cellsTotal} done</span>;
    case "complete":
      return <span className={cls}>Complete</span>;
    case "owned":
      return <span className={cls}><Zap size={10} /> Owned</span>;
    case "review-due":
      return <span className={cls}><RotateCcw size={10} /> Review due</span>;
  }
}
