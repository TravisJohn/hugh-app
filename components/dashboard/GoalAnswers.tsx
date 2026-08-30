"use client";

import { useState } from "react";
import {
  MessageSquareQuote, ChevronDown, ChevronUp, Loader2, AlertTriangle, Check,
} from "lucide-react";
import { type StoredAnswer } from "@/types";

// ── "What you told Hugh" ────────────────────────────────────────────────────
//
// The learner-facing half of migration 048. The server keeps the 5-whys
// answers so a curriculum can be evaluated against the context it was built
// from; this is where the learner reads back exactly what that means for them,
// and takes it away if they would rather it were gone.
//
// It SHOWS before it deletes, on purpose. The questions are model-generated
// and dig at motivation and circumstance, and by the time anyone comes looking
// it is weeks later — so no learner remembers what they typed. A delete button
// over invisible data asks them to trust a claim; a delete button under the
// actual sentences is a decision they can make. Reading costs one query and no
// tokens.
//
// Collapsed to a single icon by default. Nobody is looking for this until they
// are, and a privacy control that shouts is its own kind of alarming.

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; answers: StoredAnswer[] }
  | { kind: "deleting"; answers: StoredAnswer[] }
  | { kind: "deleteFailed"; answers: StoredAnswer[]; message: string }
  | { kind: "deleted"; count: number };

interface Props {
  goalId: string;
  topic:  string;
}

export default function GoalAnswers({ goalId, topic }: Props) {
  const [open, setOpen]             = useState(false);
  const [phase, setPhase]           = useState<Phase>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setPhase({ kind: "loading" });
    try {
      const res  = await fetch(`/api/dashboard/goals/${goalId}/answers`);
      const data = (await res.json()) as { answers?: StoredAnswer[] };
      if (!res.ok || !data.answers) {
        setPhase({ kind: "error" });
        return;
      }
      setPhase({ kind: "loaded", answers: data.answers });
    } catch {
      setPhase({ kind: "error" });
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    setConfirming(false);
    // Re-read on every open rather than caching. This panel's only job is to
    // be accurate about what is stored right now, and a stale list here would
    // be a false statement about the learner's own data.
    if (next) void load();
  }

  async function handleDelete(answers: StoredAnswer[]) {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setPhase({ kind: "deleting", answers });
    try {
      const res  = await fetch(`/api/dashboard/goals/${goalId}/answers`, { method: "DELETE" });
      const data = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok) {
        setPhase({
          kind:    "deleteFailed",
          answers,
          message: data.error ?? "Your answers could not be deleted.",
        });
        return;
      }
      setPhase({ kind: "deleted", count: data.deleted ?? answers.length });
    } catch {
      setPhase({
        kind:    "deleteFailed",
        answers,
        message: "Could not reach the server — nothing was deleted.",
      });
    }
  }

  const answers =
    phase.kind === "loaded" || phase.kind === "deleting" || phase.kind === "deleteFailed"
      ? phase.answers
      : [];

  return (
    <>
      <button
        onClick={toggle}
        aria-expanded={open}
        title={`What you told Hugh about "${topic}"`}
        className={`flex items-center gap-0.5 rounded-lg p-1.5 transition-colors ${
          open
            ? "bg-sky-500/10 text-sky-300"
            : "text-slate-600 hover:bg-sky-500/10 hover:text-sky-300"
        }`}
      >
        <MessageSquareQuote size={14} />
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {/* order-last, not DOM order: the trigger above sits inline with the
          card's action buttons, but this panel has to land on the row BELOW
          them. Without it, `w-full` wraps at this point in the flex row and
          pushes the actions down to a third line. */}
      {open && (
        <div className="order-last mt-3 w-full rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            What you told Hugh
          </p>

          {/* ── Reading ───────────────────────────────────────────────── */}
          {phase.kind === "loading" && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" />
              Reading what&apos;s stored…
            </div>
          )}

          {/* A dropped query must never render as "nothing is stored" — on
              this panel of all panels, that is a false reassurance. */}
          {phase.kind === "error" && (
            <div className="mt-3 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
              <div>
                <p className="text-xs leading-relaxed text-slate-300">
                  We couldn&apos;t read your answers just now.
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  This isn&apos;t a sign they are gone — the list simply
                  didn&apos;t load.
                </p>
                <button
                  onClick={() => void load()}
                  className="mt-2 text-xs font-semibold text-sky-400 transition-colors hover:text-sky-300"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── Deleted ───────────────────────────────────────────────── */}
          {phase.kind === "deleted" && (
            <div className="mt-3 flex items-start gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" />
              <div>
                <p className="text-xs leading-relaxed text-slate-300">
                  {phase.count === 1
                    ? "Your answer has been deleted."
                    : `Your ${phase.count} answers have been deleted.`}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Your track and everything on it stays exactly as it is.
                </p>
              </div>
            </div>
          )}

          {/* ── Nothing stored ────────────────────────────────────────── */}
          {phase.kind === "loaded" && answers.length === 0 && (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Nothing is stored for this goal — either you skipped the
              questions, or this track was built from a document rather than a
              conversation.
            </p>
          )}

          {/* ── The answers ───────────────────────────────────────────── */}
          {answers.length > 0 && (
            <>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                Hugh kept these to shape this track, and to check whether
                knowing your reasons produces a better one. Only you can see
                them.
              </p>

              <ul className="mt-3 space-y-3">
                {answers.map(a => (
                  <li key={a.position}>
                    <p className="text-xs leading-relaxed text-slate-500">{a.question}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-200">{a.answer}</p>
                  </li>
                ))}
              </ul>

              {phase.kind === "deleteFailed" && (
                <p className="mt-3 text-xs leading-relaxed text-red-400">{phase.message}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-800 pt-3">
                {confirming ? (
                  <>
                    <span className="text-xs text-slate-400">Delete them for good?</span>
                    <button
                      onClick={() => void handleDelete(answers)}
                      className="text-xs font-semibold text-red-400 transition-colors hover:text-red-300"
                    >
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="text-xs text-slate-500 transition-colors hover:text-slate-300"
                    >
                      Keep them
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => void handleDelete(answers)}
                    disabled={phase.kind === "deleting"}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition-colors hover:text-red-400 disabled:opacity-50"
                  >
                    {phase.kind === "deleting"
                      ? <Loader2 size={12} className="animate-spin" />
                      : null}
                    {phase.kind === "deleting" ? "Deleting…" : "Delete these answers"}
                  </button>
                )}
                <span className="text-xs text-slate-600">Your track is unaffected.</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
