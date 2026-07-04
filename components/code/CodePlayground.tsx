"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Play, Zap } from "lucide-react";
import { useCodeLadder } from "@/hooks/useCodeLadder";
import { useHughTyping } from "@/hooks/useHughTyping";
import CmEditor from "./CmEditor";
import TaskPrompt from "./TaskPrompt";
import CountdownTimer from "./CountdownTimer";
import LadderProgress from "./LadderProgress";
import RunConsole from "./RunConsole";
import ResultOverlay from "./ResultOverlay";

/**
 * Top-level client component for the isolated Hugh Code playground. Owns nothing
 * itself — all run state lives in `useCodeLadder`; this just lays it out and
 * wires the keyboard shortcut. No scroll: h-screen flex column, min-h-0 children.
 */
export default function CodePlayground() {
  const ladder = useCodeLadder();
  const {
    state,
    task,
    rungIndex,
    totalRungs,
    timeLeft,
    timerSeconds,
    lastResult,
    initError,
    code,
    setCode,
    start,
    submit,
    restart,
  } = ladder;

  const racing = state === "RACING";

  // Hugh ghost-types while racing; on game over reveal his full solution.
  const hugh = useHughTyping(task.hughSolution, racing);
  const hughDisplay = state === "GAME_OVER" ? task.hughSolution : hugh.typed;

  // ⌘/Ctrl + Enter to run & check during a race.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && racing) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [racing, submit]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#0A0F1E]">
      {/* Subtle background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative flex shrink-0 items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/home"
            className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100">Hugh Code</span>
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-300">
              Python
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <LadderProgress index={rungIndex} total={totalRungs} />
          <CountdownTimer timeLeft={timeLeft} total={timerSeconds} />
        </div>
      </header>

      {/* ── Prompt band ────────────────────────────────────────── */}
      <div className="relative shrink-0 border-b border-slate-800/60 px-6 py-4">
        <TaskPrompt title={task.title} prompt={task.prompt} />
      </div>

      {/* ── Editors ────────────────────────────────────────────── */}
      <main className="relative grid min-h-0 flex-1 grid-cols-2 gap-4 p-4">
        {/* You */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-1.5">
            <span className="text-xs font-medium text-slate-300">You</span>
            {racing && (
              <span className="text-[10px] uppercase tracking-wider text-sky-400/70">
                editing
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CmEditor value={code} onChange={setCode} readOnly={!racing} />
          </div>
        </section>

        {/* Hugh */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-violet-300">
              <Zap size={12} /> Hugh
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {state === "GAME_OVER" ? "solution" : "pacer"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CmEditor value={hughDisplay} readOnly />
          </div>
        </section>
      </main>

      {/* ── Footer (console + action) ──────────────────────────── */}
      <footer className="relative flex shrink-0 items-center justify-between gap-4 border-t border-slate-800 px-6 py-3">
        <div className="min-w-0 flex-1">
          <RunConsole state={state} result={lastResult} />
        </div>
        <ActionButton
          state={state}
          onStart={start}
          onSubmit={submit}
        />
      </footer>

      {/* ── Overlays ───────────────────────────────────────────── */}
      {state === "LOADING_RUNTIME" && (
        <Overlay>
          <Loader2 className="mb-3 animate-spin text-sky-400" size={28} />
          <p className="text-sm text-slate-300">Booting Python…</p>
          <p className="mt-1 text-xs text-slate-500">First load fetches the runtime (~7&nbsp;MB).</p>
        </Overlay>
      )}
      {initError && (
        <Overlay>
          <p className="text-sm font-medium text-red-400">Couldn&apos;t start Python</p>
          <p className="mt-1 max-w-xs text-center text-xs text-slate-500">{initError}</p>
        </Overlay>
      )}
      <ResultOverlay
        state={state}
        rungReached={rungIndex}
        total={totalRungs}
        onRestart={restart}
      />
    </div>
  );
}

function ActionButton({
  state,
  onStart,
  onSubmit,
}: {
  state: ReturnType<typeof useCodeLadder>["state"];
  onStart: () => void;
  onSubmit: () => void;
}) {
  if (state === "READY") {
    return (
      <button
        onClick={onStart}
        className="flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-400"
      >
        <Play size={16} /> Start rung
      </button>
    );
  }
  if (state === "RACING") {
    return (
      <button
        onClick={onSubmit}
        className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400"
      >
        Run &amp; Check
        <kbd className="rounded bg-emerald-600/60 px-1.5 py-0.5 text-[10px]">⌘↵</kbd>
      </button>
    );
  }
  if (state === "CHECKING") {
    return (
      <button
        disabled
        className="flex items-center gap-2 rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-slate-300"
      >
        <Loader2 size={16} className="animate-spin" /> Checking…
      </button>
    );
  }
  if (state === "PASS") {
    return (
      <span className="rounded-lg bg-emerald-500/15 px-5 py-2 text-sm font-medium text-emerald-300">
        Passed ✓
      </span>
    );
  }
  return null; // LOADING / GAME_OVER / WON handled by overlays
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0A0F1E]/90 backdrop-blur-sm">
      {children}
    </div>
  );
}
