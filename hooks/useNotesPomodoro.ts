"use client";

import { useCallback, useEffect, useState } from "react";

// A Notes-only focus timer. Deliberately EPHEMERAL: state lives in memory (no
// localStorage, unlike the app-wide usePomodoro), so it exists only while the
// Notes workspace is mounted. Leaving /notes unmounts the workspace and the
// timer vanishes; returning starts fresh. This is what keeps it from leaking out
// of Notes the way the learn-flow timer did.

export type NotesPomodoroPhase = "idle" | "focus" | "break";

const BREAK_MIN = 5;
const TICK_MS   = 500;

// Wall-clock based (endsAt) so throttled intervals can't drift the display.
// `pausedRemaining` present ⇒ paused (and `endsAt` is stale).
interface Session {
  phase:            "focus" | "break";
  endsAt:           number;
  focusMin:         number;
  pausedRemaining?: number;
}

export interface NotesPomodoroApi {
  phase:       NotesPomodoroPhase;
  remainingMs: number;
  paused:      boolean;
  completed:   "focus" | "break" | null; // transient; clear with acknowledge()
  start:       (minutes: number) => void;
  pause:       () => void;
  resume:      () => void;
  stop:        () => void;
  startBreak:  () => void;
  acknowledge: () => void;
}

function remainingOf(s: Session | null, now: number): number {
  if (!s) return 0;
  if (s.pausedRemaining != null) return Math.max(0, s.pausedRemaining);
  return Math.max(0, s.endsAt - now);
}

export function useNotesPomodoro(): NotesPomodoroApi {
  const [session, setSession]     = useState<Session | null>(null);
  const [completed, setCompleted] = useState<"focus" | "break" | null>(null);
  const [now, setNow]             = useState(() => Date.now());

  // Tick while running; fire completion the moment a running phase hits zero.
  useEffect(() => {
    if (!session || session.pausedRemaining != null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (session.endsAt - t <= 0) {
        setCompleted(session.phase);
        setSession(null);
      }
    };
    const id = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [session]);

  const start = useCallback((minutes: number) => {
    setCompleted(null);
    setSession({ phase: "focus", endsAt: Date.now() + minutes * 60_000, focusMin: minutes });
  }, []);

  const startBreak = useCallback(() => {
    setCompleted(null);
    setSession((prev) => ({ phase: "break", endsAt: Date.now() + BREAK_MIN * 60_000, focusMin: prev?.focusMin ?? 25 }));
  }, []);

  const pause = useCallback(() => {
    setSession((s) => (s && s.pausedRemaining == null
      ? { ...s, pausedRemaining: Math.max(0, s.endsAt - Date.now()) }
      : s));
  }, []);

  const resume = useCallback(() => {
    setSession((s) => (s && s.pausedRemaining != null
      ? { phase: s.phase, focusMin: s.focusMin, endsAt: Date.now() + s.pausedRemaining }
      : s));
  }, []);

  const stop        = useCallback(() => { setSession(null); setCompleted(null); }, []);
  const acknowledge = useCallback(() => setCompleted(null), []);

  return {
    phase:       session?.phase ?? "idle",
    remainingMs: remainingOf(session, now),
    paused:      session?.pausedRemaining != null,
    completed,
    start, pause, resume, stop, startBreak, acknowledge,
  };
}
