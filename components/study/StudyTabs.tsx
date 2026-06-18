import Link from "next/link";
import { TrendingUp, MessageCircle, Mic, Lock } from "lucide-react";

interface Props {
  goalId:    string;
  activeTab: "track" | "ask";
}

export default function StudyTabs({ goalId, activeTab }: Props) {
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

    </div>
  );
}
