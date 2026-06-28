"use client";

import { createContext, useContext } from "react";
import { usePomodoro, type PomodoroApi } from "@/hooks/usePomodoro";
import PomodoroDock from "./PomodoroDock";

const PomodoroContext = createContext<PomodoroApi | null>(null);

/**
 * Read the single app-wide Pomodoro session. Must be called inside
 * <PomodoroProvider> (mounted once in the root layout).
 */
export function usePomodoroContext(): PomodoroApi {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error("usePomodoroContext must be used within PomodoroProvider");
  return ctx;
}

/**
 * Owns the one and only Pomodoro timer for the whole app. The hook is wall-clock
 * + localStorage based, so the session keeps running across navigation; mounting
 * it here (not per-page) means a single source of truth — no duplicate intervals
 * or competing localStorage writers. Renders the global PomodoroDock so the timer
 * stays visible wherever the rules allow (e.g. Kanban, the milestone drawer).
 */
export default function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const pomo = usePomodoro();
  return (
    <PomodoroContext.Provider value={pomo}>
      {children}
      <PomodoroDock />
    </PomodoroContext.Provider>
  );
}
