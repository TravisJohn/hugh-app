import Link from "next/link";
import { Clock, CheckCircle2 } from "lucide-react";
import type { CaseProgress, CaseStub, Difficulty } from "@/types/cases";

const DIFFICULTY_META: Record<Difficulty, { label: string; cls: string }> = {
  intro: { label: "Intro", cls: "bg-emerald-500/15 text-emerald-300" },
  core: { label: "Core", cls: "bg-sky-500/15 text-sky-300" },
  hard: { label: "Hard", cls: "bg-violet-500/15 text-violet-300" },
};

/** One case "post" in the library grid. Links into the player. */
export default function CaseCard({
  stub,
  progress,
}: {
  stub: CaseStub;
  progress?: CaseProgress;
}) {
  const diff = DIFFICULTY_META[stub.difficulty];
  return (
    <Link
      href={`/cases/${stub.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/40 hover:bg-slate-900/70 hover:shadow-xl hover:shadow-sky-500/10"
    >
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${diff.cls}`}>
          {diff.label}
        </span>
        {progress?.completed && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 size={13} />
            {progress.bestHeld} of 3
          </span>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-slate-100">{stub.title}</h3>
        <p className="mt-0.5 text-sm text-slate-500">{stub.company}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-slate-800/70 px-1.5 py-0.5 text-[11px] text-slate-400">
          {stub.facets.industry}
        </span>
        {stub.facets.statistics.slice(0, 2).map((t) => (
          <span
            key={t}
            className="rounded-md bg-slate-800/70 px-1.5 py-0.5 text-[11px] text-slate-400"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between pt-1 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {stub.estMinutes} min
        </span>
        <span className="font-medium text-sky-400 transition-colors group-hover:text-sky-300">
          {progress?.completed ? "Play again →" : "Start →"}
        </span>
      </div>
    </Link>
  );
}
