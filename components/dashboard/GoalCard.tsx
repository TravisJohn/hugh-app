"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Trash2, Loader2 } from "lucide-react";
import { type LearningGoal } from "@/types";

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

interface Props {
  goal:     LearningGoal;
  onDelete?: (id: string) => void;
}

export default function GoalCard({ goal, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  async function handleDeleteClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    await fetch(`/api/dashboard/goals/${goal.id}`, { method: "DELETE" });
    onDelete?.(goal.id);
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition-colors hover:border-slate-600 hover:bg-slate-800">
      {/* Glowing star */}
      <div className="shrink-0">
        <Sparkles size={20} className="text-amber-400 animate-pulse" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-100 leading-snug">{goal.topic}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Started {fmt(goal.start_date)} · Commit until {fmt(goal.end_date)}
        </p>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-slate-400">Remove goal?</span>
            <button
              onClick={handleDeleteClick}
              disabled={deleting}
              className="flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : null}
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              No
            </button>
          </>
        ) : (
          <button
            onClick={handleDeleteClick}
            className="rounded-lg p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove goal"
          >
            <Trash2 size={14} />
          </button>
        )}

        <Link
          href={`/study/${goal.id}`}
          className="glow-amber rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400 transition-colors"
        >
          Start →
        </Link>
      </div>
    </div>
  );
}
