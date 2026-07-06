"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Play, Check, Loader2, Volume2, VolumeX,
  Music, Music2, RotateCcw, Eye, EyeOff, Trophy, Zap, RefreshCw, Minus, Plus,
} from "lucide-react";
import { PyodideRunner } from "@/lib/code/pyodideClient";
import { SCENARIO, DRILL_CELLS } from "@/lib/code/drillContent";
import CmEditor from "./CmEditor";
import ConfettiCanvas, { type ConfettiHandle } from "./ConfettiCanvas";
import SwarmBackdrop from "./SwarmBackdrop";
import { useDrillAudio } from "@/hooks/useDrillAudio";

type Status = "idle" | "running" | "pass" | "fail";
interface CState { code: string; status: Status; attempts: number; usedRef: boolean; error: string | null }

const emptyCells = (): CState[] =>
  DRILL_CELLS.map(() => ({ code: "", status: "idle", attempts: 0, usedRef: false, error: null }));

// The instruction is authored as a Python comment; strip the leading # for the prompt label.
const promptText = (i: number) => DRILL_CELLS[i].instruction.replace(/^#\s?/, "");

function comboLabel(c: number): string {
  if (c >= 6) return "Unstoppable!";
  if (c >= 5) return "On fire! 🔥";
  if (c >= 3) return "Great!";
  return "Nice!";
}

/**
 * THROWAWAY UX SPIKE — notebook-drill loop for the future "Code" pillar.
 * The prompt + reference live OUTSIDE the editor (read-only, non-copyable) so
 * you must type from memory rather than uncommenting. Shift+Enter checks a cell
 * against hidden asserts on the result. A learner-controlled Reference toggle
 * replaces the rigid "round 2 = no comments" rule; per-cell Redo + Restart let
 * you re-practice freely. Correct cells fire an escalating celebration.
 */
export default function DrillMock() {
  const [cells, setCells]       = useState<CState[]>(emptyCells);
  const [round, setRound]       = useState(1);
  const [active, setActive]     = useState(0);
  const [combo, setCombo]       = useState(0);
  const [started, setStarted]   = useState(false);
  const [ready, setReady]       = useState(false);
  const [initError, setInitErr] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(DRILL_CELLS[0].timerSeconds);
  const [toast, setToast]       = useState<string | null>(null);
  const [showRefs, setShowRefs] = useState(true); // global "with comments" toggle
  const [fontSize, setFontSize] = useState(15);   // accessibility: editor/prompt text size

  const runnerRef = useRef<PyodideRunner | null>(null);
  const confetti  = useRef<ConfettiHandle>(null);
  const cellsRef  = useRef(cells); cellsRef.current = cells;
  const audio     = useDrillAudio();

  const allPassed = cells.every(c => c.status === "pass");
  const owned = allPassed && round === 2;
  const refVisible = (i: number) => showRefs || cells[i].usedRef;

  useEffect(() => {
    const r = new PyodideRunner();
    runnerRef.current = r;
    r.init().then(() => setReady(true)).catch(e => setInitErr(String(e?.message ?? e)));
    return () => r.destroy();
  }, []);

  useEffect(() => { setTimeLeft(DRILL_CELLS[active]?.timerSeconds ?? 20); }, [active]);

  useEffect(() => {
    if (!started || allPassed) return;
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [started, active, allPassed]);

  // Speed meter low → reveal this cell's reference (never punishes).
  const revealRef = useCallback((i: number) => {
    setCells(prev => prev.map((c, idx) => (idx === i && !c.usedRef ? { ...c, usedRef: true } : c)));
  }, []);

  useEffect(() => {
    if (!started) return;
    const cell = DRILL_CELLS[active];
    const st = cellsRef.current[active];
    if (!cell || !st || st.status === "pass" || showRefs) return;
    if (timeLeft > 0 && timeLeft <= Math.ceil(cell.timerSeconds * 0.3) && !st.usedRef) {
      revealRef(active);
    }
  }, [timeLeft, started, active, showRefs, revealRef]);

  function setCode(i: number, code: string) {
    setCells(prev => prev.map((c, idx) => (idx === i ? { ...c, code } : c)));
  }

  const runCell = useCallback(async (i: number) => {
    const runner = runnerRef.current;
    if (!runner || !ready) return;
    const snap = cellsRef.current;
    if (snap[i].status === "running" || snap[i].status === "pass") return;
    setCells(prev => prev.map((c, idx) => (idx === i ? { ...c, status: "running", error: null } : c)));

    const preamble = SCENARIO.setupCode + "\n" + snap.slice(0, i).map(c => c.code).join("\n") + "\n";
    const res = await runner.run(preamble + snap[i].code, DRILL_CELLS[i].assertions);

    // The reference being visible for this cell counts as "helped" — combo only
    // builds when you produce it from memory.
    const helped = showRefs || snap[i].usedRef;
    setCells(prev => prev.map((c, idx) =>
      idx === i
        ? { ...c, status: res.passed ? "pass" : "fail", attempts: c.attempts + 1, error: res.passed ? null : (res.error ?? "Not quite yet.") }
        : c,
    ));

    if (res.passed) {
      const nextCombo = helped ? 0 : combo + 1;
      setCombo(nextCombo);
      confetti.current?.fire(nextCombo);
      audio.celebrate(nextCombo);
      setToast(comboLabel(nextCombo));
      window.setTimeout(() => setToast(null), 1300);
      if (i + 1 < DRILL_CELLS.length) setActive(i + 1);
    } else if (snap[i].attempts + 1 >= 2 && !showRefs) {
      revealRef(i);
    }
  }, [ready, combo, showRefs, audio, revealRef]);

  function onType(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k.length === 1 || k === "Backspace" || k === "Enter" || k === "Tab" || k === " ") audio.click();
  }

  function start() { audio.unlock(); setStarted(true); setActive(0); }
  function nextRound() { setRound(2); setShowRefs(false); setCells(emptyCells()); setActive(0); setCombo(0); }
  function restart() { setRound(1); setShowRefs(true); setCells(emptyCells()); setActive(0); setCombo(0); }
  function redoCell(i: number) {
    setCells(prev => prev.map((c, idx) => (idx === i ? { code: "", status: "idle", attempts: 0, usedRef: false, error: null } : c)));
    setActive(i);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0F1E] text-slate-200">
      <SwarmBackdrop />
      <ConfettiCanvas ref={confetti} />

      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-[#0A0F1E]/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/code" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
            <ArrowLeft size={14} /> Back
          </Link>
          <span className="font-semibold text-slate-100">Hugh Code</span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
            Drill · spike
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Round {round}</span>
        </div>
        <div className="flex items-center gap-3">
          {combo >= 2 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-300">
              <Zap size={13} /> ×{combo}
            </span>
          )}
          {/* Text size (accessibility) */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 px-1 py-0.5">
            <button
              onClick={() => setFontSize(s => Math.max(13, s - 2))}
              disabled={fontSize <= 13}
              title="Smaller text"
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
            >
              <Minus size={12} />
            </button>
            <span className="w-8 select-none text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">Aa</span>
            <button
              onClick={() => setFontSize(s => Math.min(24, s + 2))}
              disabled={fontSize >= 24}
              title="Larger text"
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
            >
              <Plus size={12} />
            </button>
          </div>
          {started && (
            <>
              <button
                onClick={() => setShowRefs(v => !v)}
                title="Show / hide the reference answers"
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${showRefs ? "bg-sky-500/15 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}
              >
                {showRefs ? <Eye size={13} /> : <EyeOff size={13} />} Reference
              </button>
              <button onClick={restart} title="Restart the drill" className="text-slate-400 hover:text-slate-200">
                <RotateCcw size={16} />
              </button>
            </>
          )}
          <button onClick={audio.toggleSound} title="Sound" className="text-slate-400 hover:text-slate-200">
            {audio.soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button onClick={audio.toggleMusic} title="Music" className="text-slate-400 hover:text-slate-200">
            {audio.musicOn ? <Music size={16} /> : <Music2 size={16} className="opacity-40" />}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 py-8">
        {/* Scenario */}
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h1 className="font-serif text-xl font-bold text-white">{SCENARIO.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{SCENARIO.blurb}</p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
{SCENARIO.setupCode}
          </pre>
        </div>

        {initError && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-300">
            Couldn&apos;t start Python: {initError}
          </div>
        )}

        {!started ? (
          <button
            onClick={start}
            disabled={!ready}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 font-medium text-white transition-colors hover:bg-sky-400 disabled:opacity-50"
          >
            {ready ? <><Play size={16} /> Start drill</> : <><Loader2 size={16} className="animate-spin" /> Booting Python…</>}
          </button>
        ) : (
          <div className="space-y-4">
            {DRILL_CELLS.map((cell, i) => {
              const st = cells[i];
              const isActive = i === active && !allPassed;
              const pct = Math.round((timeLeft / cell.timerSeconds) * 100);
              const showRef = refVisible(i) && st.status !== "pass";
              return (
                <div
                  key={cell.id}
                  className={`rounded-xl border transition-colors ${
                    st.status === "pass" ? "border-emerald-500/40 bg-emerald-950/10"
                    : isActive ? "border-sky-500/50 bg-slate-900/60"
                    : "border-slate-800 bg-slate-900/30"
                  }`}
                >
                  <div className="flex items-center justify-between px-4 py-2 text-xs">
                    <span className="font-mono text-slate-500">In [{i + 1}]</span>
                    {isActive && st.status !== "pass" && (
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-28 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full transition-all duration-1000 ease-linear ${pct <= 30 ? "bg-amber-400" : "bg-sky-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-slate-500">speed</span>
                      </div>
                    )}
                    {st.status === "pass" && (
                      <span className="flex items-center gap-1 font-semibold text-emerald-400">
                        <Check size={13} /> passed{st.usedRef || (round === 1) ? " · with reference" : " · from memory"}
                      </span>
                    )}
                  </div>

                  {/* Prompt — outside the editor */}
                  <p className="px-4 pb-1 text-slate-300" style={{ fontSize: fontSize + 1 }}>{promptText(i)}</p>

                  {/* Reference to replicate — read-only, non-copyable */}
                  {showRef && (
                    <pre
                      onCopy={e => e.preventDefault()}
                      style={{ fontSize: fontSize - 1 }}
                      className="mx-4 mb-2 select-none overflow-x-auto rounded-lg border border-sky-500/20 bg-sky-950/20 p-2.5 leading-relaxed text-sky-200/80"
                      title="Type this yourself — copy is disabled on purpose"
                    >
{cell.solution}
                    </pre>
                  )}

                  <div
                    className="border-y border-slate-800/60"
                    style={{ height: Math.round(fontSize * 7 + 46) }}
                    onKeyDown={onType}
                  >
                    <CmEditor
                      value={st.code}
                      onChange={v => setCode(i, v)}
                      onSubmit={() => runCell(i)}
                      readOnly={st.status === "pass"}
                      fontSize={fontSize}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0 flex-1 truncate text-xs">
                      {st.status === "fail" && <span className="text-amber-400">✗ {st.error}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {(st.status === "pass" || st.attempts > 0) && (
                        <button onClick={() => redoCell(i)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
                          <RefreshCw size={12} /> Redo
                        </button>
                      )}
                      {st.status !== "pass" && !refVisible(i) && (
                        <button onClick={() => revealRef(i)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-300">
                          <Eye size={12} /> Reveal
                        </button>
                      )}
                      <button
                        onClick={() => runCell(i)}
                        disabled={st.status === "pass" || st.status === "running"}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-40"
                      >
                        {st.status === "running" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Run &amp; check
                        <kbd className="rounded bg-emerald-600/60 px-1 text-[9px]">⇧↵</kbd>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {allPassed && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/15 p-5 text-center">
                {owned ? (
                  <>
                    <Trophy className="mx-auto text-amber-300" size={26} />
                    <p className="mt-2 font-semibold text-white">Owned it 🏆</p>
                    <p className="mt-1 text-sm text-slate-400">You did it from memory. That&apos;s the rep that sticks.</p>
                    <button onClick={restart} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
                      <RotateCcw size={14} /> Start over
                    </button>
                  </>
                ) : (
                  <>
                    <Check className="mx-auto text-emerald-400" size={26} />
                    <p className="mt-2 font-semibold text-white">Round 1 done.</p>
                    <p className="mt-1 text-sm text-slate-400">Round 2 hides the reference — do it from memory. (You can flip it back on anytime.)</p>
                    <button onClick={nextRound} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400">
                      <Play size={14} /> Round 2 — from memory
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-fadeIn">
          <span className="rounded-full bg-amber-500/20 px-5 py-2 text-lg font-bold text-amber-200 shadow-lg backdrop-blur">
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}
