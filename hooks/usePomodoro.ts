"use client";

import { useCallback, useEffect, useState } from "react";

export type PomodoroPhase = "idle" | "focus" | "break";

const STORAGE_KEY = "hugh:pomodoro";
const BREAK_MIN   = 5;
const TICK_MS     = 500;

// Persisted shape — wall-clock based so the timer survives reloads and tab
// throttling. `pausedRemaining` present ⇒ paused (and `endsAt` is stale).
interface PomodoroSession {
  phase:            "focus" | "break";
  endsAt:           number; // epoch ms when the phase ends (when running)
  focusMin:         number; // chosen focus length, for restart context
  pausedRemaining?: number; // ms left, set only while paused
}

export interface PomodoroApi {
  phase:       PomodoroPhase;
  remainingMs: number;
  paused:      boolean;
  focusActive: boolean;            // drives the 1h prompt-cache TTL on /learn/chat
  completed:   "focus" | "break" | null; // transient; clear with acknowledge()
  start:       (minutes: number) => void;
  pause:       () => void;
  resume:      () => void;
  stop:        () => void;
  startBreak:  () => void;
  acknowledge: () => void;
}

// ── Pure helpers (wall-clock math) — exported for sanity-checks ──────────────
export function remainingOf(s: PomodoroSession | null, now: number): number {
  if (!s) return 0;
  if (s.pausedRemaining != null) return Math.max(0, s.pausedRemaining);
  return Math.max(0, s.endsAt - now);
}

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Pomodoro focus timer for the Ask page. A focus block (15/25/50 min) counts
 * down; on completion it chimes and offers an optional 5-minute break — it never
 * blocks the learner. `focusActive` is what the chat route reads to switch its
 * prompt cache to the 1-hour TTL during deliberate, spaced study.
 */
export function usePomodoro(): PomodoroApi {
  const [session, setSession]     = useState<PomodoroSession | null>(null);
  const [completed, setCompleted] = useState<"focus" | "break" | null>(null);
  const [, forceTick]             = useState(0);

  // Hydrate any in-flight session on mount.
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    try { setSession(JSON.parse(raw) as PomodoroSession); } catch { /* ignore corrupt state */ }
  }, []);

  // Persist on every change (and clear when idle).
  useEffect(() => {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  // Tick while running; recompute on tab refocus so a throttled interval can't
  // leave a stale display.
  useEffect(() => {
    if (!session || session.pausedRemaining != null) return;
    const id = setInterval(() => forceTick(t => t + 1), TICK_MS);
    const onVisible = () => forceTick(t => t + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [session]);

  // Fire completion the moment a running phase hits zero.
  useEffect(() => {
    if (!session || session.pausedRemaining != null) return;
    if (session.endsAt - Date.now() > 0) return;
    setCompleted(session.phase);
    setSession(null);
  });

  const start = useCallback((minutes: number) => {
    setCompleted(null);
    setSession({ phase: "focus", endsAt: Date.now() + minutes * 60_000, focusMin: minutes });
  }, []);

  const startBreak = useCallback(() => {
    setCompleted(null);
    setSession(prev => ({ phase: "break", endsAt: Date.now() + BREAK_MIN * 60_000, focusMin: prev?.focusMin ?? 25 }));
  }, []);

  const pause = useCallback(() => {
    setSession(s => (s && s.pausedRemaining == null
      ? { ...s, pausedRemaining: Math.max(0, s.endsAt - Date.now()) }
      : s));
  }, []);

  const resume = useCallback(() => {
    setSession(s => (s && s.pausedRemaining != null
      ? { phase: s.phase, focusMin: s.focusMin, endsAt: Date.now() + s.pausedRemaining }
      : s));
  }, []);

  const stop        = useCallback(() => { setSession(null); setCompleted(null); }, []);
  const acknowledge = useCallback(() => setCompleted(null), []);

  return {
    phase:       session?.phase ?? "idle",
    remainingMs: remainingOf(session, Date.now()),
    paused:      session?.pausedRemaining != null,
    focusActive: session?.phase === "focus",
    completed,
    start, pause, resume, stop, startBreak, acknowledge,
  };
}
