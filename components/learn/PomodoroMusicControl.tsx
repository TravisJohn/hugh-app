"use client";

import { Music, Music2 } from "lucide-react";
import { useFocusMusicContext } from "./PomodoroProvider";

/**
 * Focus-music on/off toggle, sized to sit inside the Pomodoro widget (the floating
 * dock and the Ask-toolbar control). Off by default; turning it on plays a random
 * track (chosen by FocusMusicPlayer). Renders nothing when no tracks are configured.
 */
export default function PomodoroMusicControl() {
  const { enabled, tracks, setEnabled } = useFocusMusicContext();

  if (tracks.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      title={enabled ? "Turn off focus music" : "Play focus music"}
      aria-label={enabled ? "Turn off focus music" : "Play focus music"}
      aria-pressed={enabled}
      className={`rounded p-1 transition-colors ${
        enabled ? "text-rose-300 hover:text-rose-200" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {enabled ? <Music2 size={13} /> : <Music size={13} />}
    </button>
  );
}
