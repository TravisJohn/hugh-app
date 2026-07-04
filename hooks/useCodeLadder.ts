"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PyodideRunner } from "@/lib/code/pyodideClient";
import { CODE_TASKS, DEFAULT_TIMER_SECONDS } from "@/lib/code/tasks";
import type { CodeTask, LadderState, RunResult } from "@/types/code";

/** Seconds allotted to the rung at the given index. */
function taskTime(index: number): number {
  return CODE_TASKS[index]?.timerSeconds ?? DEFAULT_TIMER_SECONDS;
}

/** Brief pause on PASS so the celebration registers before the next rung. */
const PASS_DWELL_MS = 900;

export interface CodeLadder {
  state: LadderState;
  task: CodeTask;
  rungIndex: number;
  totalRungs: number;
  /** Seconds remaining on the current rung (fractional, for a smooth ring). */
  timeLeft: number;
  /** Full allotment for the current rung, for computing the ring fraction. */
  timerSeconds: number;
  lastResult: RunResult | null;
  /** Set if Pyodide failed to boot. */
  initError: string | null;
  code: string;
  setCode: (value: string) => void;
  /** READY → RACING. */
  start: () => void;
  /** RACING → CHECKING → PASS | back to RACING (or GAME_OVER). */
  submit: () => void;
  /** GAME_OVER | WON → READY at rung 0. */
  restart: () => void;
}

/**
 * Owns the entire playground run: the strict state machine, the countdown, and
 * the Pyodide runner. Components receive state + handlers from this hook — they
 * never touch the runner directly. Refs mirror state so the interval and async
 * submit callbacks always read current values (project convention).
 */
export function useCodeLadder(): CodeLadder {
  const [state, setState] = useState<LadderState>("LOADING_RUNTIME");
  const [rungIndex, setRungIndex] = useState(0);
  const [code, setCode] = useState(CODE_TASKS[0].starterCode);
  const [timeLeft, setTimeLeft] = useState(taskTime(0));
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const task = CODE_TASKS[rungIndex];

  // ── Stale-closure-proof mirrors ────────────────────────────────────────
  const runnerRef = useRef<PyodideRunner | null>(null);
  const stateRef = useRef(state);
  const rungIndexRef = useRef(rungIndex);
  const codeRef = useRef(code);
  const taskRef = useRef(task);
  const deadlineRef = useRef<number>(0);

  // Mirror latest state into refs after each commit, so the countdown interval
  // and async submit callback always read current values without re-subscribing.
  // Runs after paint but before any user-triggered handler (start/submit) fires.
  useEffect(() => {
    stateRef.current = state;
    rungIndexRef.current = rungIndex;
    codeRef.current = code;
    taskRef.current = task;
  });

  // ── Boot Pyodide once ──────────────────────────────────────────────────
  useEffect(() => {
    const runner = new PyodideRunner();
    runnerRef.current = runner;
    runner.init().then(
      () => setState((s) => (s === "LOADING_RUNTIME" ? "READY" : s)),
      (e) => setInitError(e instanceof Error ? e.message : String(e)),
    );
    return () => runner.destroy();
  }, []);

  // ── Countdown (only while RACING) ──────────────────────────────────────
  useEffect(() => {
    if (state !== "RACING") return;
    const id = setInterval(() => {
      const remaining = (deadlineRef.current - Date.now()) / 1000;
      if (remaining <= 0) {
        setTimeLeft(0);
        setState("GAME_OVER");
      } else {
        setTimeLeft(remaining);
      }
    }, 100);
    return () => clearInterval(id);
  }, [state]);

  // ── Auto-advance after a PASS ──────────────────────────────────────────
  useEffect(() => {
    if (state !== "PASS") return;
    const id = setTimeout(() => {
      const next = rungIndexRef.current + 1;
      if (next >= CODE_TASKS.length) {
        setState("WON");
        return;
      }
      setRungIndex(next);
      setCode(CODE_TASKS[next].starterCode);
      setLastResult(null);
      deadlineRef.current = Date.now() + taskTime(next) * 1000;
      setTimeLeft(taskTime(next));
      setState("RACING");
    }, PASS_DWELL_MS);
    return () => clearTimeout(id);
  }, [state]);

  const start = useCallback(() => {
    if (stateRef.current !== "READY") return;
    setLastResult(null);
    deadlineRef.current = Date.now() + taskTime(rungIndexRef.current) * 1000;
    setTimeLeft(taskTime(rungIndexRef.current));
    setState("RACING");
  }, []);

  const submit = useCallback(async () => {
    const runner = runnerRef.current;
    if (!runner || stateRef.current !== "RACING") return;

    // Pause the clock while we execute so exec time isn't held against the run.
    const remaining = (deadlineRef.current - Date.now()) / 1000;
    setState("CHECKING");

    const result = await runner.run(codeRef.current, taskRef.current.assertions);
    setLastResult(result);

    if (result.passed) {
      setState("PASS");
    } else if (remaining <= 0) {
      setTimeLeft(0);
      setState("GAME_OVER");
    } else {
      deadlineRef.current = Date.now() + remaining * 1000;
      setState("RACING");
    }
  }, []);

  const restart = useCallback(() => {
    setRungIndex(0);
    setCode(CODE_TASKS[0].starterCode);
    setLastResult(null);
    setTimeLeft(taskTime(0));
    setState("READY");
  }, []);

  return {
    state,
    task,
    rungIndex,
    totalRungs: CODE_TASKS.length,
    timeLeft,
    timerSeconds: taskTime(rungIndex),
    lastResult,
    initError,
    code,
    setCode,
    start,
    submit,
    restart,
  };
}
