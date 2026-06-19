"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, BookOpen, OctagonAlert, ChevronRight } from "lucide-react";
import { type Milestone } from "@/types";

interface Props {
  milestone:  Milestone;
  entryCount: number;
  isActive:   boolean;
  isPulsing:  boolean;
  isOverlay?: boolean;
  onClick:    (milestone: Milestone) => void;
}

const CARD_TINTS: Record<string, { bg: string; border: string }> = {
  backlog: { bg: "bg-slate-800",      border: "border-slate-700"    },
  learn:   { bg: "bg-sky-950/80",     border: "border-sky-900/60"   },
  review:  { bg: "bg-amber-950/60",   border: "border-amber-900/50" },
  done:    { bg: "bg-green-950/60",   border: "border-green-900/50" },
};

export default function MilestoneCard({ milestone, entryCount, isActive, isPulsing, isOverlay, onClick }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   milestone.id,
    data: { kanban_column: milestone.kanban_column },
  });

  const tint          = CARD_TINTS[milestone.kanban_column] ?? CARD_TINTS.backlog;
  const needsReview   = milestone.kanban_column === "review" && !milestone.review_validated;

  // Overlay: the floating card while dragging
  if (isOverlay) {
    return (
      <div className={`flex flex-col gap-2 rounded-xl border p-4 shadow-2xl shadow-black/60 ring-1 ring-white/10 scale-[1.03] cursor-grabbing select-none
        ${tint.bg} ${tint.border}`}
      >
        {needsReview && (
          <div className="absolute left-2 top-[13px] glow-red pointer-events-none">
            <OctagonAlert size={13} className="text-red-400" />
          </div>
        )}
        <p className={`text-sm font-semibold text-slate-100 leading-snug pr-6 ${needsReview ? "pl-5" : ""}`}>
          {milestone.title}
        </p>
        <p className="line-clamp-2 text-xs text-slate-400 leading-relaxed">
          {milestone.summary}
        </p>
        {entryCount > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
            <BookOpen size={11} className="text-slate-500" />
            <span className="text-xs text-slate-500">
              {entryCount} {entryCount === 1 ? "entry" : "entries"}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onClick(milestone)}
      className={`group relative flex flex-col gap-2 rounded-xl border p-4 transition-all duration-200 select-none
        ${isDragging
          ? "border-dashed border-slate-600 bg-slate-800/20 opacity-30"
          : isActive
          ? "cursor-pointer border-violet-500/60 bg-slate-800 shadow-[0_0_18px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/30"
          : isPulsing
          ? "cursor-pointer border-violet-400 bg-slate-800 shadow-[0_0_28px_rgba(139,92,246,0.55)] ring-2 ring-violet-400/40"
          : `cursor-grab active:cursor-grabbing ${tint.bg} ${tint.border} hover:brightness-110 hover:border-opacity-80`
        }`}
    >
      {/* Unvalidated review indicator — subtle pulsing red stop sign */}
      {needsReview && !isDragging && (
        <div className="absolute left-2 top-[13px] glow-red pointer-events-none">
          <OctagonAlert size={13} className="text-red-400" />
        </div>
      )}

      {/* Grip handle */}
      {!isDragging && (
        <div className="absolute right-2 top-2 text-slate-600 opacity-30 group-hover:opacity-70 transition-opacity pointer-events-none">
          <GripVertical size={14} />
        </div>
      )}

      <p className={`text-sm font-semibold text-slate-100 leading-snug pr-6 ${needsReview ? "pl-5" : ""}`}>
        {milestone.title}
      </p>

      <p className="line-clamp-2 text-xs text-slate-400 leading-relaxed">
        {milestone.summary}
      </p>

      <div className="flex items-center justify-between mt-1">
        {entryCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <BookOpen size={11} className="text-slate-500" />
            <span className="text-xs text-slate-500">
              {entryCount} {entryCount === 1 ? "entry" : "entries"}
            </span>
          </div>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-0.5 text-xs text-slate-400 cursor-pointer hover:text-slate-100 transition-colors select-none">
          See details
          <ChevronRight size={11} />
        </span>
      </div>
    </div>
  );
}
