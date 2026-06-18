"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, BookOpen } from "lucide-react";
import { type Milestone } from "@/types";

interface Props {
  milestone:  Milestone;
  entryCount: number;
  isActive:   boolean;
  isPulsing:  boolean;
  onClick:    (milestone: Milestone) => void;
}

export default function MilestoneCard({ milestone, entryCount, isActive, isPulsing, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:   milestone.id,
    data: { kanban_column: milestone.kanban_column },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick(milestone)}
      className={`group relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-slate-800 p-4 transition-all duration-200
        ${isDragging
          ? "border-sky-500 shadow-lg shadow-sky-900/30 opacity-75 z-50"
          : isActive
          ? "border-violet-500/60 shadow-[0_0_18px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/30"
          : isPulsing
          ? "border-violet-400 shadow-[0_0_28px_rgba(139,92,246,0.55)] ring-2 ring-violet-400/40"
          : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/80"
        }`}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        {...attributes}
        onClick={e => e.stopPropagation()}
        className="absolute right-2 top-2 cursor-grab rounded p-1 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-slate-400 active:cursor-grabbing transition-opacity"
      >
        <GripVertical size={14} />
      </div>

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
