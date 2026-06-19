"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Trophy, Medal } from "lucide-react";
import { type Milestone, type KanbanColumn, KANBAN_COLUMNS } from "@/types";
import KanbanColumnComponent from "./KanbanColumn";
import MilestoneCard from "./MilestoneCard";
import MilestoneDrawer from "./MilestoneDrawer";

interface Props {
  initialMilestones: Milestone[];
  topicContext?:     string;
  goalId?:           string;
  pulseId?:          string;
  validatedId?:      string;
  masteredId?:       string;
}

export default function KanbanBoard({ initialMilestones, topicContext, goalId, pulseId: initialPulseId, validatedId, masteredId }: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  const [milestones, setMilestones]               = useState<Milestone[]>(initialMilestones);
  const [activeMilestone, setActiveMilestone]     = useState<Milestone | null>(null);
  const [draggingMilestone, setDraggingMilestone] = useState<Milestone | null>(null);
  const [entryCounts, setEntryCounts]             = useState<Record<string, number>>({});
  const [pulseId, setPulseId]                     = useState<string | null>(initialPulseId ?? null);

  // Celebration state
  const [toastVisible, setToastVisible]     = useState(false);
  const [toastTitle,   setToastTitle]       = useState("");
  const [toastKind,    setToastKind]        = useState<"review" | "mastery">("review");

  // Confetti + toast when returning from a passed quiz (review)
  useEffect(() => {
    if (!validatedId) return;
    const ms = milestones.find(m => m.id === validatedId);
    setToastTitle(ms?.title ?? "");
    setToastKind("review");
    setToastVisible(true);
    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({ particleCount: 110, spread: 70, origin: { y: 0.65 }, colors: ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ffffff"] });
      setTimeout(() => {
        confetti({ particleCount: 60, spread: 90, origin: { y: 0.55 }, colors: ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b"] });
      }, 200);
    });
    router.replace(pathname, { scroll: false });
    const t = setTimeout(() => setToastVisible(false), 5000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bigger gold confetti + toast when returning from a passed mastery session
  useEffect(() => {
    if (!masteredId) return;
    const ms = milestones.find(m => m.id === masteredId);
    setToastTitle(ms?.title ?? "");
    setToastKind("mastery");
    setToastVisible(true);
    import("canvas-confetti").then(({ default: confetti }) => {
      const gold = ["#f59e0b", "#fcd34d", "#fbbf24", "#ffffff", "#10b981"];
      confetti({ angle: 60,  spread: 55, particleCount: 100, origin: { x: 0, y: 0.7 }, colors: gold });
      confetti({ angle: 120, spread: 55, particleCount: 100, origin: { x: 1, y: 0.7 }, colors: gold });
      setTimeout(() => {
        confetti({ particleCount: 80, spread: 100, origin: { y: 0.45 }, colors: gold });
      }, 350);
    });
    router.replace(pathname, { scroll: false });
    const t = setTimeout(() => setToastVisible(false), 6000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pulseId) return;
    const t = setTimeout(() => setPulseId(null), 5000);
    return () => clearTimeout(t);
  }, [pulseId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart({ active }: DragStartEvent) {
    const ms = milestones.find(m => m.id === active.id);
    setDraggingMilestone(ms ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraggingMilestone(null);
    if (!over) return;

    const milestoneId = active.id as string;
    const newColumn   = over.id as KanbanColumn;
    const current     = milestones.find(m => m.id === milestoneId);
    if (!current || current.kanban_column === newColumn) return;

    const updatedFields: Partial<Milestone> = { kanban_column: newColumn };
    if (newColumn === "review") updatedFields.review_validated  = false;
    if (newColumn === "done")   updatedFields.mastery_validated = false;

    setMilestones(prev =>
      prev.map(m => m.id === milestoneId ? { ...m, ...updatedFields } : m)
    );

    const patchBody: { column: KanbanColumn; reviewValidated?: boolean; masteryValidated?: boolean } = { column: newColumn };
    if (newColumn === "review") patchBody.reviewValidated  = false;
    if (newColumn === "done")   patchBody.masteryValidated = false;

    fetch(`/api/tracker/milestones/${milestoneId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patchBody),
    }).catch(() => {
      setMilestones(prev =>
        prev.map(m => m.id === milestoneId ? { ...m, ...current } : m)
      );
    });
  }

  function handleDragCancel() {
    setDraggingMilestone(null);
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
    <div className="relative h-full">
      {/* Subtle background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-breathe absolute -top-1/3 right-1/4 h-[600px] w-[600px] rounded-full bg-sky-500/[0.06] blur-3xl" />
        <div className="animate-breathe-delayed absolute -bottom-1/3 left-1/5 h-[700px] w-[700px] rounded-full bg-violet-500/[0.05] blur-3xl" />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="relative z-10 flex flex-col h-full gap-2">
          <div className="flex gap-4 flex-1 min-h-0">
            {KANBAN_COLUMNS.map(col => (
              <KanbanColumnComponent
                key={col}
                column={col}
                milestones={byColumn[col]}
                entryCounts={entryCounts}
                activeId={activeMilestone?.id ?? null}
                pulseId={pulseId}
                isDragging={!!draggingMilestone}
                onCardClick={handleCardClick}
              />
            ))}
          </div>

          <p className={`text-center text-xs text-slate-600 transition-opacity duration-200 ${draggingMilestone ? "opacity-100" : "opacity-0"}`}>
            Drop on any column — cards can move forward or backward
          </p>
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
          {draggingMilestone && (
            <MilestoneCard
              milestone={draggingMilestone}
              entryCount={entryCounts[draggingMilestone.id] ?? 0}
              isActive={false}
              isPulsing={false}
              isOverlay
              onClick={() => {}}
            />
          )}
        </DragOverlay>
      </DndContext>

      <MilestoneDrawer
        milestone={activeMilestone}
        topicContext={topicContext}
        goalId={goalId}
        onClose={handleDrawerClose}
      />

      {/* Celebration toast */}
      {toastVisible && (
        <div className="fixed bottom-8 left-1/2 z-50 animate-toast-in">
          {toastKind === "mastery" ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-500/50 bg-[#1a1000] px-5 py-4 shadow-2xl shadow-black/60 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                <Medal size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-300">Mastered!</p>
                {toastTitle && (
                  <p className="mt-0.5 max-w-[220px] truncate text-xs text-amber-500/70">{toastTitle}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-green-500/40 bg-[#0a1a12] px-5 py-4 shadow-2xl shadow-black/60 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-500/20">
                <Trophy size={18} className="text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-300">Card Validated!</p>
                {toastTitle && (
                  <p className="mt-0.5 max-w-[220px] truncate text-xs text-green-500/70">{toastTitle}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
