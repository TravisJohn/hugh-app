"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, BookOpen } from "lucide-react";
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

  const tint = CARD_TINTS[milestone.kanban_column] ?? CARD_TINTS.backlog;

  // Overlay: the floating card while dragging
  if (isOverlay) {
    return (
      <div className={`flex flex-col gap-2 rounded-xl border p-4 shadow-2xl shadow-black/60 ring-1 ring-white/10 scale-[1.03] cursor-grabbing select-none
        ${tint.bg} ${tint.border}`}
      >
        <p className="pr-6 text-sm font-semibold text-slate-100 leading-snug">
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
      {/* Grip handle — visual only, always subtly visible */}
      {!isDragging && (
        <div className="absolute right-2 top-2 text-slate-600 opacity-30 group-hover:opacity-70 transition-opacity pointer-events-none">
          <GripVertical size={14} />
        </div>
      )}

      <p className="pr-6 text-sm font-semibold text-slate-100 leading-snug">
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
