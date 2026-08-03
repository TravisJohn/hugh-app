"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import HeatGauge, { heatSummary } from "./HeatGauge";
import PackBadge from "./PackBadge";
import type { HeatReading } from "@/lib/code/heat";
import type { DrillPack } from "@/lib/code/packs";
import type { PackProgressSummary } from "@/lib/code/progress";

// One pack hanging off an opened group. The row itself stays a single fixed
// height so eight of them fit the viewport — title and blurb are clamped to one
// line each — and the full text lives in a panel that appears on hover or focus.
//
// The panel is positioned by INDEX, not by measuring: leaves in the top half
// open downwards, leaves in the bottom half open upwards. An absolutely
// positioned panel still contributes to the document's scroll height, so one
// hanging off the last leaf would push the page past the viewport and break the
// no-scroll rule. Flipping by index keeps it inside the branch's own vertical
// band without a measurement pass or a resize listener.
//
// The panel is aria-hidden and pointer-events-none: `truncate` clips visually
// but leaves the full text in the DOM, so assistive tech already reads the whole
// title and blurb from the link. The panel is a sighted-user affordance only,
// and must never swallow the click heading for the drill.
//
// It reveals on `peer-hover` / `peer-focus-visible` off the link, NOT on
// `group-focus-within` off the wrapper. PatternMap moves focus to the first leaf
// whenever a branch opens, and focus-within fired on that — so every group
// opened with a panel already hanging over the leaves below it. focus-visible
// ignores programmatic focus, so the panel still appears for a keyboard user
// tabbing through, and stays shut when the branch simply opens.

/** Static wrapper carries `data-branch-leaf` — BranchLinks measures it. */
export default function LeafCard({
  pack,
  index,
  total,
  icon: Icon,
  accent,
  heat,
  progress,
  staggerMs,
}: {
  pack: DrillPack;
  index: number;
  total: number;
  icon: LucideIcon;
  accent: string;
  heat?: HeatReading;
  progress?: PackProgressSummary;
  staggerMs: number;
}) {
  const openUp = total > 2 && index >= Math.ceil(total / 2);

  return (
    <div data-branch-leaf className="relative min-w-0">
      <Link
        href={`/code/drill?pack=${encodeURIComponent(pack.id)}`}
        style={{ animationDelay: `${index * staggerMs}ms` }}
        className="peer animate-leaf-in flex min-w-0 items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2.5 transition-colors hover:border-slate-600 hover:bg-slate-900 focus-visible:border-slate-500 focus-visible:outline-none"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          <Icon size={14} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{pack.title}</span>
          <span className="block truncate text-xs text-slate-500">{pack.blurb}</span>
        </span>

        <span className="flex shrink-0 items-center gap-2.5">
          {heat && <HeatGauge heat={heat} size="sm" />}
          {progress && <PackBadge progress={progress} />}
          <span className="w-14 text-right text-[11px] text-slate-600">
            {pack.content.cells.length} reps
          </span>
        </span>
      </Link>

      {/* Detail panel — everything the row had to clip. */}
      <div
        aria-hidden
        data-leaf-panel
        className={`pointer-events-none absolute left-8 z-30 w-[26rem] max-w-[calc(100vw-4rem)] rounded-xl border border-slate-700 bg-[#0d1424] p-4 opacity-0 shadow-2xl shadow-black/60 transition-opacity duration-150 peer-hover:opacity-100 peer-focus-visible:opacity-100 ${
          openUp ? "bottom-full mb-2" : "top-full mt-2"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            <Icon size={14} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{pack.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">{pack.blurb}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-800 pt-3">
          {progress && <PackBadge progress={progress} />}
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400">
            {pack.tag}
          </span>
          <span className="text-[11px] text-slate-500">{pack.content.cells.length} reps</span>
        </div>

        {heat && (
          <div className="mt-2.5 flex items-center gap-2">
            <HeatGauge heat={heat} size="sm" />
            <span className="text-[11px] text-slate-500">{heatSummary(heat)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
