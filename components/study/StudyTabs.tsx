import Link from "next/link";
import { TrendingUp, MessageCircle, Mic, Lock, CalendarClock } from "lucide-react";

interface Props {
  goalId:      string;
  activeTab:   "track" | "ask";
  courseTitle: string;
  endDate:     string;
}

// Whole days between today and the goal's end date. Both ends are normalised to
// local midnight so a few hours either side don't skew the count.
function daysUntil(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  end.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86_400_000);
}

export default function StudyTabs({ goalId, activeTab, courseTitle, endDate }: Props) {
  const days = daysUntil(endDate);

  const daysLabel =
    days > 1   ? `${days} days left` :
    days === 1 ? "1 day left"        :
    days === 0 ? "Last day"          :
    `${Math.abs(days)} days over`;

  // Nudge harder as the deadline approaches (or passes).
  const daysTone =
    days <= 0 ? "bg-rose-500/10 text-rose-400"   :
    days <= 7 ? "bg-amber-500/10 text-amber-400" :
                "bg-slate-800 text-slate-400";

  return (
    <div className="shrink-0 flex items-center gap-1 border-b border-slate-800 bg-slate-900/40 px-4 py-2">

      {/* Track tab */}
      <Link
        href={`/study/${goalId}/track`}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          activeTab === "track"
            ? "bg-green-500/10 text-green-400"
            : "text-slate-500 hover:text-slate-200 hover:bg-slate-800"
        }`}
      >
        <TrendingUp size={14} />
        Track
      </Link>

      {/* Ask tab */}
      <Link
        href={`/study/${goalId}/ask`}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          activeTab === "ask"
            ? "bg-violet-500/10 text-violet-400"
            : "text-slate-500 hover:text-slate-200 hover:bg-slate-800"
        }`}
      >
        <MessageCircle size={14} />
        Ask
      </Link>

      {/* Converse — locked, tooltip on hover */}
      <div className="relative group">
        <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 cursor-not-allowed">
          <Mic size={14} />
          Converse
          <Lock size={11} className="ml-0.5 text-slate-700" />
        </div>
        <div className="pointer-events-none absolute left-0 top-full mt-2 z-20 hidden w-56 group-hover:block">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl text-xs text-slate-400 leading-relaxed">
            Hugh needs more learning data to unlock Converse for this topic.
          </div>
        </div>
      </div>

      {/* Course title + remaining days — pushed to the right */}
      <div className="ml-auto flex items-center gap-3 pl-4 min-w-0">
        <span
          className="hidden sm:block max-w-[240px] truncate text-sm font-medium text-slate-300"
          title={courseTitle}
        >
          {courseTitle}
        </span>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${daysTone}`}
        >
          <CalendarClock size={12} />
          {daysLabel}
        </span>
      </div>

    </div>
  );
}
