import Link from "next/link";
import { Sparkles } from "lucide-react";
import { type LearningGoal } from "@/types";

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function GoalCard({ goal }: { goal: LearningGoal }) {
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

      {/* Glowing Start button */}
      <Link
        href={`/study/${goal.id}`}
        className="glow-amber shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400 transition-colors"
      >
        Start →
      </Link>
    </div>
  );
}
