"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { type TopicDomainVerdict } from "@/lib/learn/topic-domain";

interface Props {
  verdict: TopicDomainVerdict;
  /** Fills the topic field with a chosen angle. Omit where no field exists. */
  onPickSuggestion?: (suggestion: string) => void;
}

// The one place the topic gate speaks to a learner. Shared by the typed-topic
// panel and the document flow so the two cannot drift into saying different
// things about the same verdict.
//
// It renders TWO different notices, and the difference is the point:
//
//   needs_angle — Hugh is asking a question. No warning colour, no warning
//                 icon, and copy that never suggests the topic is off-limits,
//                 because it isn't. The suggestions are the answers.
//   out         — Hugh is declining, kindly. Warning treatment, and the
//                 suggestions (if any) are a bridge, not an answer.
//
// Rendering the first as the second is the bug this component exists to stop:
// it is what told someone typing "Generative AI" that their topic sat outside
// a data & analytics app, then offered them "Machine learning engineering
// fundamentals" as consolation.
export default function TopicGateNotice({ verdict, onPickSuggestion }: Props) {
  if (verdict.verdict === "in") return null;

  const asking = verdict.verdict === "needs_angle";

  const fallbackMessage = asking
    ? "That topic covers a lot of ground — which part are you after?"
    : "Hugh is built specifically for data & analytics skill prep — that topic sits outside this focus.";

  return (
    <div
      className={
        asking
          ? "rounded-xl border border-slate-700 bg-slate-800/50 p-4"
          : "rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
      }
    >
      <div className="flex items-start gap-2.5">
        {asking ? (
          <Sparkles size={16} className="mt-0.5 shrink-0 text-amber-400" />
        ) : (
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
        )}
        <div className="space-y-2.5">
          <p className="text-sm leading-relaxed text-slate-200">
            {verdict.message || fallbackMessage}
          </p>

          {verdict.suggestions.length > 0 && onPickSuggestion && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                {asking ? "Pick an angle" : "Try a data angle"}
              </p>
              <div className="flex flex-wrap gap-2">
                {verdict.suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onPickSuggestion(s)}
                    className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/20 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
