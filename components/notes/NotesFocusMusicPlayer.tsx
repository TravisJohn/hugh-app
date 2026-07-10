"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusMusicContext } from "@/components/learn/PomodoroProvider";
import { useNotesPomodoroContext } from "./NotesPomodoroProvider";

const TARGET_VOLUME = 0.35; // background music sits under the learner's attention
const FADE_MS       = 700;

/**
 * Focus music for the Notes-only timer — the same experience as the learn-flow
 * FocusMusicPlayer, but driven by the ephemeral Notes timer (via
 * useNotesPomodoroContext) instead of the global one. It's mounted only inside
 * the Notes workspace, so there's no silent-route check: if the Notes timer is
 * running and the shared music preference is on, it plays. Shares the on/off
 * preference + track list with the global player (useFocusMusicContext), so the
 * learner's choice carries across the app. Random shuffle, non-looping, fades.
 */
export default function NotesFocusMusicPlayer() {
  const { enabled, tracks } = useFocusMusicContext();
  const { phase }           = useNotesPomodoroContext();

  const audioRef      = useRef<HTMLAudioElement>(null);
  const fadeRef       = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);
  const [src, setSrc] = useState<string | null>(null);

  const wantMusic = enabled && phase !== "idle" && tracks.length > 0;

  // Pick a random track, avoiding an immediate repeat of the current one.
  const pickRandom = useCallback((exclude: string | null): string | null => {
    if (tracks.length === 0) return null;
    if (tracks.length === 1) return tracks[0];
    let next = exclude;
    while (next === exclude) next = tracks[Math.floor(Math.random() * tracks.length)];
    return next;
  }, [tracks]);

  // Start a fresh shuffle each time music transitions into playing.
  useEffect(() => {
    if (wantMusic && !wasPlayingRef.current) {
      setSrc((prev) => pickRandom(prev));
    }
    wasPlayingRef.current = wantMusic;
  }, [wantMusic, pickRandom]);

  // When a track finishes, advance to another random one (shuffle, non-looping).
  const handleEnded = useCallback(() => {
    setSrc((prev) => pickRandom(prev));
  }, [pickRandom]);

  const shouldPlay = wantMusic && !!src;

  // Drive playback + fades on the audio element.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (fadeRef.current !== null) cancelAnimationFrame(fadeRef.current);

    const fade = (to: number, done?: () => void) => {
      const from  = el.volume;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / FADE_MS);
        el.volume = Math.max(0, Math.min(1, from + (to - from) * p));
        if (p < 1) fadeRef.current = requestAnimationFrame(step);
        else { fadeRef.current = null; done?.(); }
      };
      fadeRef.current = requestAnimationFrame(step);
    };

    if (shouldPlay) {
      if (el.paused) el.volume = 0;
      // Autoplay is allowed because enabling music / starting focus was a click;
      // after a reload without a fresh gesture the browser may block it — fail soft.
      el.play().then(() => fade(TARGET_VOLUME)).catch(() => { /* blocked until gesture */ });
    } else {
      fade(0, () => el.pause());
    }

    return () => {
      if (fadeRef.current !== null) cancelAnimationFrame(fadeRef.current);
    };
  }, [shouldPlay, src]);

  return <audio ref={audioRef} src={src ?? undefined} onEnded={handleEnded} preload="none" />;
}
