import { Fragment } from "react";
import type { Decision } from "@/types/cases";
import Artifact from "./Artifact";

/** Renders *word* as subtle emphasis (used in a couple of consequences). */
function emphasize(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith("*") && part.endsWith("*") ? (
      <em key={i} className="text-slate-400">
        {part.slice(1, -1)}
      </em>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

interface Props {
  decision: Decision;
  phase: "prompt" | "consequence";
  /** The option selected but not yet committed (prompt phase). */
  selected: string | null;
  /** The committed option id (consequence phase). */
  committed: string | null;
  isLast: boolean;
  onSelect: (id: string) => void;
  onLockIn: () => void;
  onContinue: () => void;
}

/**
 * One decision on the reconverging spine. Commit-before-reveal is enforced here:
 * in the prompt phase the consequence does not exist in the DOM at all — it only
 * appears after the learner locks a choice in.
 */
export default function DecisionStep({
  decision,
  phase,
  selected,
  committed,
  isLast,
  onSelect,
  onLockIn,
  onContinue,
}: Props) {
  if (phase === "prompt") {
    const locked = selected != null;
    return (
      <div className="animate-fadeIn">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Decision — commit before you see what it surfaces
        </div>
        <h2 className="mb-5 text-xl font-semibold text-slate-100">{decision.prompt}</h2>
        <Artifact artifact={decision.artifact} />

        <div className="mt-4 space-y-3">
          {decision.options.map((o) => {
            const on = selected === o.id;
            return (
              <button
                key={o.id}
                onClick={() => onSelect(o.id)}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  on
                    ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      on
                        ? "border-sky-500 bg-sky-500 text-white"
                        : "border-slate-700 text-slate-500"
                    }`}
                  >
                    {o.id}
                  </span>
                  <span>
                    <span className="block font-medium text-slate-200">{o.label}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">{o.detail}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={onLockIn}
          disabled={!locked}
          className={`mt-6 w-full rounded-lg px-5 py-3 font-medium transition-colors ${
            locked
              ? "bg-slate-100 text-slate-900 hover:bg-white"
              : "cursor-not-allowed bg-slate-800 text-slate-600"
          }`}
        >
          {locked ? "Lock in this choice" : "Select an option to continue"}
        </button>
      </div>
    );
  }

  // consequence phase
  const o = decision.options.find((x) => x.id === committed);
  if (!o) return null;
  const strong = o.flag === "strong";
  const stripe = strong
    ? "border-emerald-500/30 bg-emerald-500/5"
    : "border-amber-500/30 bg-amber-500/5";

  return (
    <div className="animate-fadeIn">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        What that surfaced
      </div>
      <h2 className="mb-4 text-xl font-semibold text-slate-100">{decision.prompt}</h2>

      <div className={`rounded-xl border ${stripe} p-5`}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-200">You chose {o.id}:</span>
          <span className="text-slate-400">{o.label}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              strong
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {strong ? "strong" : "weaker"}
          </span>
        </div>
        <p className="leading-relaxed text-slate-300">{emphasize(o.consequence)}</p>
        <Artifact artifact={o.artifact} />
      </div>

      {!strong && (
        <p className="mt-3 text-sm text-slate-500">
          Not a dead end — you keep going. Noticing <em>why</em> this path is weaker is the
          point.
        </p>
      )}

      <button
        onClick={onContinue}
        className="mt-6 w-full rounded-lg bg-sky-600 px-5 py-3 font-medium text-white transition-colors hover:bg-sky-500"
      >
        {isLast ? "See the reveal" : "Continue"}
      </button>
    </div>
  );
}
