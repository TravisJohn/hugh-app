"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Case } from "@/types/cases";
import { computeFlags, heldCount } from "@/lib/cases/scoring";
import Scorecard from "./Scorecard";
import DecisionStep from "./DecisionStep";
import RevealScreen from "./RevealScreen";

type Screen = "intro" | "step" | "reveal";
type Phase = "prompt" | "consequence";

interface PlayerState {
  screen: Screen;
  stepIndex: number;
  phase: Phase;
  selected: string | null;
  choices: Record<string, string>;
}

const INITIAL: PlayerState = {
  screen: "intro",
  stepIndex: 0,
  phase: "prompt",
  selected: null,
  choices: {},
};

/**
 * Top-level client component for playing one case. Owns the strict flow
 * (intro → step[prompt→consequence]* → reveal), the persistent scorecard, and
 * saving the completed attempt. No runtime AI, no network on the play path — the
 * only fetch is a best-effort progress save when the reveal is reached.
 */
export default function CasePlayer({
  caseData,
  backHref,
}: {
  caseData: Case;
  backHref: string;
}) {
  const [state, setState] = useState<PlayerState>(INITIAL);
  const decisions = caseData.decisions;
  const flags = computeFlags(caseData, state.choices);

  const saveAttempt = useCallback(
    (choices: Record<string, string>) => {
      const f = computeFlags(caseData, choices);
      // Best-effort — a failed save must never block the reveal.
      void fetch("/api/cases/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: caseData.id,
          choices,
          flags: f,
          heldCount: heldCount(f),
        }),
      }).catch(() => {});
    },
    [caseData],
  );

  const begin = useCallback(() => {
    setState({ ...INITIAL, screen: "step" });
  }, []);

  const select = useCallback((id: string) => {
    setState((s) => ({ ...s, selected: id }));
  }, []);

  const lockIn = useCallback(() => {
    setState((s) => {
      if (s.selected == null) return s;
      const d = decisions[s.stepIndex];
      return {
        ...s,
        phase: "consequence",
        choices: { ...s.choices, [d.id]: s.selected },
      };
    });
  }, [decisions]);

  const next = useCallback(() => {
    setState((s) => {
      if (s.stepIndex >= decisions.length - 1) {
        saveAttempt(s.choices);
        return { ...s, screen: "reveal" };
      }
      return { ...s, stepIndex: s.stepIndex + 1, phase: "prompt", selected: null };
    });
  }, [decisions.length, saveAttempt]);

  const restart = useCallback(() => setState(INITIAL), []);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#0A0F1E] text-slate-200">
      {/* Background orbs (Hugh house style) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative flex shrink-0 items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft size={14} />
            Library
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100">{caseData.title}</span>
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-300">
              Case
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          {decisions.map((_, i) => {
            const done =
              i < state.stepIndex ||
              (i === state.stepIndex && state.phase === "consequence");
            const current = i === state.stepIndex && state.screen === "step";
            return (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  current ? "bg-sky-500" : done ? "bg-slate-500" : "bg-slate-800"
                }`}
              />
            );
          })}
        </div>
      </header>

      {/* Persistent scorecard (once playing) */}
      {state.screen !== "intro" && (
        <div className="relative shrink-0 border-b border-slate-800/60 px-6 py-3">
          <Scorecard flags={flags} />
        </div>
      )}

      {/* Content */}
      <main className="relative flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {state.screen === "intro" && (
          <Intro caseData={caseData} onBegin={begin} />
        )}

        {state.screen === "step" && (
          <div className="mx-auto max-w-2xl">
            <DecisionStep
              decision={decisions[state.stepIndex]}
              phase={state.phase}
              selected={state.selected}
              committed={decisions[state.stepIndex] ? state.choices[decisions[state.stepIndex].id] ?? null : null}
              isLast={state.stepIndex === decisions.length - 1}
              onSelect={select}
              onLockIn={lockIn}
              onContinue={next}
            />
          </div>
        )}

        {state.screen === "reveal" && (
          <RevealScreen
            caseData={caseData}
            choices={state.choices}
            backHref={backHref}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  );
}

/** The opening scenario brief + "Begin". */
function Intro({ caseData, onBegin }: { caseData: Case; onBegin: () => void }) {
  const s = caseData.scenario;
  return (
    <div className="animate-fadeIn mx-auto max-w-2xl">
      <div className="mb-2 text-xs font-medium uppercase tracking-widest text-sky-400">
        Strategic Case Analysis
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
        {caseData.title}
      </h1>
      <div className="mt-6 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-slate-500">Your role</span>{" "}
            <span className="font-medium text-slate-300">{s.role}</span>
          </div>
          <div>
            <span className="text-slate-500">Company</span>{" "}
            <span className="font-medium text-slate-300">{s.company}</span>
          </div>
        </div>
        <p className="text-lg text-slate-100">{s.situation}</p>
        <p className="text-slate-400">{s.stakeholderBelief}</p>
        <p className="border-t border-slate-800 pt-4 text-lg font-medium text-slate-100">
          {s.question}
        </p>
      </div>
      <p className="mt-5 text-sm text-slate-500">
        You&apos;ll make a few high-level calls. No code — this is about judgment. Every
        choice you commit to has a consequence; at the end you&apos;ll see your path
        A/B-tested against an expert&apos;s.
      </p>
      <button
        onClick={onBegin}
        className="mt-6 rounded-lg bg-sky-600 px-5 py-3 font-medium text-white transition-colors hover:bg-sky-500"
      >
        Begin the case
      </button>
    </div>
  );
}
