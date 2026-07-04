import Link from "next/link";
import type { Case } from "@/types/cases";
import {
  computeFlags,
  heldCount,
  diffAgainstGold,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
} from "@/lib/cases/scoring";

/**
 * The payoff: a computed counterfactual of the learner's path vs the gold path,
 * a three-muscle readout, and the planted insight. Nothing here is pre-written
 * per-ending — it's all diffed from the one gold path.
 */
export default function RevealScreen({
  caseData,
  choices,
  backHref,
  onRestart,
}: {
  caseData: Case;
  choices: Record<string, string>;
  backHref: string;
  onRestart: () => void;
}) {
  const rows = diffAgainstGold(caseData, choices);
  const flags = computeFlags(caseData, choices);
  const held = heldCount(flags);

  return (
    <div className="animate-fadeIn mx-auto max-w-2xl">
      <div className="mb-2 text-xs font-medium uppercase tracking-widest text-sky-400">
        The A/B Test
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
        Your path vs the gold path
      </h1>
      <p className="mt-2 text-slate-400">
        {held === 3
          ? "You matched the expert on every call."
          : `You held ${held} of 3 analyst muscles. Here's where paths diverged — and what each cost.`}
      </p>

      {/* Per-decision diff */}
      <div className="mt-6 space-y-4">
        {rows.map((r, i) => (
          <div
            key={r.decisionId}
            className={`rounded-xl border p-5 ${
              r.matched ? "border-emerald-500/25" : "border-amber-500/25"
            } bg-slate-900/40`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">
                {i + 1}. {r.muscleLabel}
              </span>
              {r.matched ? (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                  held ✓
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                  slipped
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-900/60 p-3">
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  Your path
                </div>
                <div className="text-sm text-slate-300">{r.yourOption.label}</div>
              </div>
              <div className="rounded-lg bg-sky-500/10 p-3">
                <div className="mb-1 text-xs uppercase tracking-wide text-sky-400/80">
                  Gold path
                </div>
                <div className="text-sm text-slate-300">{r.goldOption.label}</div>
              </div>
            </div>
            {!r.matched && r.cost ? (
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-amber-300/90">
                <span className="font-medium">What it cost you:</span>
                <span>{r.cost}</span>
              </div>
            ) : r.matched ? (
              <div className="mt-3 text-sm text-emerald-300/90">
                Matched the expert here — no cost.
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Muscle strip */}
      <div className="mt-6">
        <div className="mb-2 text-sm font-medium text-slate-400">Three analyst muscles</div>
        <div className="flex gap-3">
          {MUSCLE_ORDER.map((key) => {
            const isHeld = flags[key] === "strong";
            return (
              <div
                key={key}
                className={`flex-1 rounded-lg border p-3 text-center ${
                  isHeld
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
              >
                <div
                  className={`text-xs uppercase tracking-wide ${
                    isHeld ? "text-emerald-400/80" : "text-amber-400/80"
                  }`}
                >
                  {MUSCLE_LABELS[key]}
                </div>
                <div
                  className={`mt-1 text-sm font-semibold ${
                    isHeld ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {isHeld ? "held" : "slipped"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Planted insight */}
      <div className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/5 p-6">
        <div className="mb-2 text-xs font-medium uppercase tracking-widest text-sky-400">
          The planted insight
        </div>
        <p className="leading-relaxed text-slate-200">{caseData.insight}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={onRestart}
          className="rounded-lg border border-slate-700 bg-slate-900/40 px-5 py-3 font-medium text-slate-200 transition-colors hover:bg-slate-800"
        >
          Run the case again
        </button>
        <Link
          href={backHref}
          className="rounded-lg bg-sky-600 px-5 py-3 font-medium text-white transition-colors hover:bg-sky-500"
        >
          Back to the library
        </Link>
      </div>
    </div>
  );
}
