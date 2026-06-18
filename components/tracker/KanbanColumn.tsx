"use client";

import { useDroppable } from "@dnd-kit/core";
import { type KanbanColumn as KanbanColumnType, type Milestone, KANBAN_COLUMN_LABELS } from "@/types";
import MilestoneCard from "./MilestoneCard";

const COLUMN_STYLES: Record<KanbanColumnType, {
  dot:    string;
  header: string;
  ring:   string;
  zone:   string;   // idle drop zone tint
  over:   string;   // active drag-over tint
}> = {
  backlog: {
    dot:    "bg-slate-500",
    header: "text-slate-400",
    ring:   "ring-slate-600",
    zone:   "bg-slate-800/20",
    over:   "bg-slate-800/60",
  },
  learn: {
    dot:    "bg-sky-500",
    header: "text-sky-400",
    ring:   "ring-sky-700",
    zone:   "bg-sky-950/20",
    over:   "bg-sky-950/50",
  },
  review: {
    dot:    "bg-amber-500",
    header: "text-amber-400",
    ring:   "ring-amber-700",
    zone:   "bg-amber-950/20",
    over:   "bg-amber-950/50",
  },
  done: {
    dot:    "bg-green-500",
    header: "text-green-400",
    ring:   "ring-green-700",
    zone:   "bg-green-950/20",
    over:   "bg-green-950/50",
  },
};

interface Props {
  column:      KanbanColumnType;
  milestones:  Milestone[];
  entryCounts: Record<string, number>;
  activeId:    string | null;
  pulseId:     string | null;
  isDragging:  boolean;
  onCardClick: (milestone: Milestone) => void;
}

export default function KanbanColumn({ column, milestones, entryCounts, activeId, pulseId, isDragging, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const styles = COLUMN_STYLES[column];

  return (
    <div className="flex flex-1 flex-col min-w-0 h-full">
      {/* Column header */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
        <span className={`text-xs font-bold uppercase tracking-widest ${styles.header}`}>
          {KANBAN_COLUMN_LABELS[column]}
        </span>
        <span className="ml-auto text-xs text-slate-600 font-mono">{milestones.length}</span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-3 rounded-xl p-3 min-h-[200px] overflow-y-auto transition-all duration-150
          ${isOver
            ? `${styles.over} ring-2 ${styles.ring}`
            : isDragging
            ? `${styles.zone} ring-1 ${styles.ring} ring-opacity-50`
            : styles.zone
          }`}
      >
        {milestones.map(m => (
          <MilestoneCard
            key={m.id}
            milestone={m}
            entryCount={entryCounts[m.id] ?? 0}
            isActive={m.id === activeId}
            isPulsing={m.id === pulseId}
            onClick={onCardClick}
          />
        ))}

        {milestones.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className={`text-xs transition-colors duration-150 ${isOver ? styles.header : "text-slate-700"}`}>
              {isOver ? "Release to move here" : "Drop here"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
