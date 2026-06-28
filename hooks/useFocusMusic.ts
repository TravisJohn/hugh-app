"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FOCUS_TRACKS } from "@/lib/pomodoro/tracks";

const ENABLED_KEY = "hugh:focusmusic:on";

export interface FocusMusicApi {
  enabled:    boolean;          // learner wants focus music
  tracks:     string[];         // available track sources (random pick at play time)
  setEnabled: (on: boolean) => void;
}

/**
 * Learner preference for Pomodoro focus music: simply on or off. The actual track
 * is chosen at random by FocusMusicPlayer each time playback starts, so there's no
 * track to pick here. Persisted to localStorage. Mounted once via PomodoroProvider
 * so the dock and the Ask-toolbar control share one source of truth.
 */
export function useFocusMusic(): FocusMusicApi {
  const [enabled, setEnabledState] = useState(false);
  const enabledRef = useRef(false);

  // Hydrate saved preference on mount (effect, not lazy init, to avoid an
  // SSR/CSR hydration mismatch — the server has no localStorage).
  useEffect(() => {
    try {
      const on = localStorage.getItem(ENABLED_KEY) === "1";
      enabledRef.current = on;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabledState(on);
    } catch { /* ignore unreadable storage */ }
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    enabledRef.current = on;
    setEnabledState(on);
    try { localStorage.setItem(ENABLED_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  return { enabled, tracks: FOCUS_TRACKS, setEnabled };
}
