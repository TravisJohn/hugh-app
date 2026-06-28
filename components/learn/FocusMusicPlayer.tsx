"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isSilentRoute } from "@/lib/pomodoro/routes";
import { usePomodoroContext, useFocusMusicContext } from "./PomodoroProvider";

const TARGET_VOLUME = 0.35; // background music sits under the learner's attention
const FADE_MS       = 700;

/**
 * Always-mounted, invisible audio element for Pomodoro focus music. It survives
 * client-side navigation (it lives in the provider, not a page), so playback is
 * continuous as the learner moves around. Music plays only while the timer widget
 * is visible — i.e. a session is active AND the route isn't a silent one — so the
 * off-switch is always next to the sound. A random track is chosen each time
 * playback (re)starts, and the volume fades in/out on every transition.
 */
export default function FocusMusicPlayer() {
  const { enabled, tracks } = useFocusMusicContext();
  const { phase }           = usePomodoroContext();
  const pathname            = usePathname() ?? "";

  const audioRef    = useRef<HTMLAudioElement>(null);
  const fadeRef     = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);
  const [src, setSrc] = useState<string | null>(null);

  const wantMusic = enabled && phase !== "idle" && !isSilentRoute(pathname) && tracks.length > 0;

  // Pick a fresh random track each time music transitions into playing (toggled
  // on, a new session begins, or returning from a silent route). Stable while playing.
  useEffect(() => {
    if (wantMusic && !wasPlayingRef.current) {
      const pick = tracks[Math.floor(Math.random() * tracks.length)];
      setSrc(pick ?? null);
    }
    wasPlayingRef.current = wantMusic;
  }, [wantMusic, tracks]);

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

  return <audio ref={audioRef} src={src ?? undefined} loop preload="none" />;
}
