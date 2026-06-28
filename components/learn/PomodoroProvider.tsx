"use client";

import { createContext, useContext } from "react";
import { usePomodoro, type PomodoroApi } from "@/hooks/usePomodoro";
import { useFocusMusic, type FocusMusicApi } from "@/hooks/useFocusMusic";
import PomodoroDock from "./PomodoroDock";
import FocusMusicPlayer from "./FocusMusicPlayer";

const PomodoroContext   = createContext<PomodoroApi | null>(null);
const FocusMusicContext = createContext<FocusMusicApi | null>(null);

/**
 * Read the single app-wide Pomodoro session. Must be called inside
 * <PomodoroProvider> (mounted once in the root layout).
 */
export function usePomodoroContext(): PomodoroApi {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error("usePomodoroContext must be used within PomodoroProvider");
  return ctx;
}

/** Read the shared focus-music preference (on/off + selected track). */
export function useFocusMusicContext(): FocusMusicApi {
  const ctx = useContext(FocusMusicContext);
  if (!ctx) throw new Error("useFocusMusicContext must be used within PomodoroProvider");
  return ctx;
}

/**
 * Owns the one and only Pomodoro timer + focus-music preference for the whole app.
 * Both are wall-clock / localStorage based, so they survive navigation; mounting
 * them here (not per-page) means a single source of truth — no duplicate intervals
 * or competing writers. Renders the global PomodoroDock (visible reminder) and the
 * always-on FocusMusicPlayer (continuous audio across pages).
 */
export default function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const pomo  = usePomodoro();
  const music = useFocusMusic();
  return (
    <PomodoroContext.Provider value={pomo}>
      <FocusMusicContext.Provider value={music}>
        {children}
        <PomodoroDock />
        <FocusMusicPlayer />
      </FocusMusicContext.Provider>
    </PomodoroContext.Provider>
  );
}
