"use client";

import { createContext, useContext } from "react";
import { useNotesPomodoro, type NotesPomodoroApi } from "@/hooks/useNotesPomodoro";
import NotesFocusMusicPlayer from "./NotesFocusMusicPlayer";

const NotesPomodoroContext = createContext<NotesPomodoroApi | null>(null);

/**
 * Read the Notes-only focus timer. Must be called inside <NotesPomodoroProvider>
 * (mounted once at the top of the Notes workspace).
 */
export function useNotesPomodoroContext(): NotesPomodoroApi {
  const ctx = useContext(NotesPomodoroContext);
  if (!ctx) throw new Error("useNotesPomodoroContext must be used within NotesPomodoroProvider");
  return ctx;
}

/**
 * Owns the single ephemeral Notes timer and the Notes focus-music player. Kept
 * here (not in the workspace component) so the timer's 500ms tick re-renders only
 * this provider + its context consumers — the three heavy panes are passed as
 * `children` and stay put. The whole thing unmounts with the Notes route, which
 * is what makes the timer + its music strictly Notes-scoped (never leaks out).
 */
export default function NotesPomodoroProvider({ children }: { children: React.ReactNode }) {
  const pomo = useNotesPomodoro();
  return (
    <NotesPomodoroContext.Provider value={pomo}>
      {children}
      <NotesFocusMusicPlayer />
    </NotesPomodoroContext.Provider>
  );
}
