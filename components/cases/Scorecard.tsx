import type { Flag, FlagKey } from "@/types/cases";
import { MUSCLE_LABELS, MUSCLE_ORDER } from "@/lib/cases/scoring";

/**
 * The persistent three-muscle scorecard. Each pill fills in as the learner
 * commits a decision: strong → emerald, weak → amber, not-yet → neutral.
 */
export default function Scorecard({
  flags,
}: {
  flags: Partial<Record<FlagKey, Flag>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {MUSCLE_ORDER.map((key) => {
        const v = flags[key];
        let cls = "border-slate-800 bg-slate-900/40 text-slate-500";
        let dot = "bg-slate-600";
        if (v === "strong") {
          cls = "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
          dot = "bg-emerald-400";
        } else if (v === "weak") {
          cls = "border-amber-500/30 bg-amber-500/10 text-amber-300";
          dot = "bg-amber-400";
        }
        return (
          <div
            key={key}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${cls}`}
          >
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {MUSCLE_LABELS[key]}
          </div>
        );
      })}
    </div>
  );
}
