"use client";

import { useState, useCallback, useEffect } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { type Milestone, type KanbanColumn, KANBAN_COLUMNS } from "@/types";
import KanbanColumnComponent from "./KanbanColumn";
import MilestoneDrawer from "./MilestoneDrawer";

interface Props {
  initialMilestones: Milestone[];
  topicContext?:     string;
  goalId?:           string;
  pulseId?:          string;
}

export default function KanbanBoard({ initialMilestones, topicContext, goalId, pulseId: initialPulseId }: Props) {
  const [milestones, setMilestones]       = useState<Milestone[]>(initialMilestones);
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);
  const [entryCounts, setEntryCounts]     = useState<Record<string, number>>({});
  const [pulseId, setPulseId]             = useState<string | null>(initialPulseId ?? null);

  // Auto-clear the pulse glow after 5 seconds
  useEffect(() => {
    if (!pulseId) return;
    const t = setTimeout(() => setPulseId(null), 5000);
    return () => clearTimeout(t);
  }, [pulseId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const milestoneId = active.id as string;
    const newColumn   = over.id as KanbanColumn;

    const current = milestones.find(m => m.id === milestoneId);
    if (!current || current.kanban_column === newColumn) return;

    setMilestones(prev =>
      prev.map(m => m.id === milestoneId ? { ...m, kanban_column: newColumn } : m)
    );

    fetch(`/api/tracker/milestones/${milestoneId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ column: newColumn }),
    }).catch(() => {
      setMilestones(prev =>
        prev.map(m => m.id === milestoneId ? { ...m, kanban_column: current.kanban_column } : m)
      );
    });
  }

  const handleCardClick = useCallback((milestone: Milestone) => {
    setActiveMilestone(milestone);
  }, []);

  function handleDrawerClose() {
    if (activeMilestone) {
      fetch(`/api/tracker/milestones/${activeMilestone.id}/entries`)
        .then(r => r.json())
        .then(d => {
          const count = (d.entries ?? []).length as number;
          setEntryCounts(prev => ({ ...prev, [activeMilestone.id]: count }));
        })
        .catch(() => {});
    }
    setActiveMilestone(null);
  }

  const byColumn = KANBAN_COLUMNS.reduce<Record<KanbanColumn, Milestone[]>>(
    (acc, col) => {
      acc[col] = milestones.filter(m => m.kanban_column === col);
      return acc;
    },
    { backlog: [], learn: [], review: [], done: [] }
  );

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 h-full">
          {KANBAN_COLUMNS.map(col => (
            <KanbanColumnComponent
              key={col}
              column={col}
              milestones={byColumn[col]}
              entryCounts={entryCounts}
              activeId={activeMilestone?.id ?? null}
              pulseId={pulseId}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
      </DndContext>

      <MilestoneDrawer
        milestone={activeMilestone}
        topicContext={topicContext}
        goalId={goalId}
        onClose={handleDrawerClose}
      />
    </>
  );
}
