"use client";

import { useState } from "react";
import { BookMarked, Sparkles } from "lucide-react";
import { type LearningGoal } from "@/types";
import GoalCard from "./GoalCard";
import RefinementFlow from "./RefinementFlow";

interface Props {
  initialGoals: LearningGoal[];
}

type DurationChip = "2w" | "1m" | "3m" | "custom";

const CHIPS: { id: DurationChip; label: string; days: number | null }[] = [
  { id: "2w",     label: "2 weeks",  days: 14 },
  { id: "1m",     label: "1 month",  days: 30 },
  { id: "3m",     label: "3 months", days: 90 },
  { id: "custom", label: "Custom",   days: null },
];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

export default function DashboardPanel({ initialGoals }: Props) {
  const [goals, setGoals]       = useState<LearningGoal[]>(initialGoals);
  const [topic, setTopic]       = useState("");
  const [chip, setChip]         = useState<DurationChip | null>(null);
  const [customDate, setCustomDate] = useState("");

  // Refinement flow state
  const [refining, setRefining]       = useState(false);
  const [pendingTopic, setPendingTopic] = useState("");
  const [pendingEndDate, setPendingEndDate] = useState("");

  const today = todayStr();

  function resolvedEndDate(): string {
    if (!chip) return "";
    if (chip === "custom") return customDate;
    const c = CHIPS.find(c => c.id === chip)!;
    return addDays(c.days!);
  }

  const endDate    = resolvedEndDate();
  const canSubmit  = topic.trim().length > 0 && endDate.length > 0;

  function handleFinalize() {
    if (!canSubmit) return;
    setPendingTopic(topic.trim());
    setPendingEndDate(endDate);
    setRefining(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleFinalize();
  }

  function handleGoalCreated(goal: LearningGoal) {
    setGoals(prev => [goal, ...prev]);
    setRefining(false);
    setTopic("");
    setChip(null);
    setCustomDate("");
    setPendingTopic("");
    setPendingEndDate("");
  }

  function handleCancelRefinement() {
    setRefining(false);
  }

  function handleGoalDeleted(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id));
  }

  return (
    <div className="flex flex-col gap-10 px-10 py-8 max-w-2xl w-full">

      {/* ── Add goal ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">
          What do you want to learn?
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {refining
            ? "Hugh is learning more about your goal to personalize your path."
            : "Data, analytics, and everything in between — add a topic and set a commitment date."}
        </p>

        <div className="mt-5">
          {refining ? (
            <RefinementFlow
              topic={pendingTopic}
              endDate={pendingEndDate}
              onGoalCreated={handleGoalCreated}
              onCancel={handleCancelRefinement}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {/* Topic input */}
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Apache Airflow, dbt, SQL window functions, ML pipelines…"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              />

              {/* Commitment chips */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-600">
                  I&apos;ll commit for
                </p>
                <div className="flex flex-wrap gap-2">
                  {CHIPS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setChip(c.id); if (c.id !== "custom") setCustomDate(""); }}
                      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors
                        ${chip === c.id
                          ? "border-amber-500 bg-amber-500/20 text-amber-300"
                          : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                        }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {chip === "custom" && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    min={today}
                    className="mt-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                )}
              </div>

              <button
                onClick={handleFinalize}
                disabled={!canSubmit}
                className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Sparkles size={15} />
                Let&apos;s Discuss
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Library ────────────────────────────────────────────────── */}
      {goals.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookMarked size={15} className="text-slate-500" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              My learning library
            </h2>
            <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-600 font-mono">
              {goals.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {goals.map(g => <GoalCard key={g.id} goal={g} onDelete={handleGoalDeleted} />)}
          </div>
        </section>
      )}

      {goals.length === 0 && !refining && (
        <p className="text-sm text-slate-700 italic">
          Your library is empty — add your first topic above.
        </p>
      )}
    </div>
  );
}
