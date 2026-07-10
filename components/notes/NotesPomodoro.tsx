"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { formatMmSs } from "@/hooks/usePomodoro";
import { playChime } from "@/lib/pomodoro/chime";
import PomodoroMusicControl from "@/components/learn/PomodoroMusicControl";
import { useNotesPomodoroContext } from "./NotesPomodoroProvider";

const FOCUS_OPTIONS = [15, 25, 50];

/**
 * The Notes-only focus timer, rendered in the Notes top bar. Reads the ephemeral
 * timer from NotesPomodoroProvider (which also drives the Notes focus music), so
 * it lives and dies with the Notes workspace and never appears anywhere else. It
 * mirrors the learn-flow experience: idle → a picker to start; running → a live
 * countdown with a focus-music toggle + pause/stop; on completion → a chime and a
 * compact inline prompt to take a break / go again.
 */
export default function NotesPomodoro() {
  const pomo = useNotesPomodoroContext();
  const { phase, remainingMs, paused, completed } = pomo;
  const [pickerOpen, setPickerOpen] = useState(false);

  // Chime once per completion (ref-guarded against re-renders / double-invoke).
  const chimedFor = useRef<"focus" | "break" | null>(null);
  useEffect(() => {
    if (!completed) { chimedFor.current = null; return; }
    if (chimedFor.current === completed) return;
    chimedFor.current = completed;
    playChime();
  }, [completed]);

  // Completion prompt takes priority (timer is idle at this point).
  if (completed) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-[#1a0f12]/80 py-1 pl-2.5 pr-1.5">
        <span aria-hidden className="text-sm leading-none">{completed === "focus" ? "🍅" : "☕"}</span>
        <span className="text-xs font-medium text-rose-200">
          {completed === "focus" ? "Focus done" : "Break's over"}
        </span>
        {completed === "focus" ? (
          <button
            onClick={pomo.startBreak}
            className="rounded-md bg-sky-600 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
          >
            Take 5
          </button>
        ) : (
          <button
            onClick={() => pomo.start(25)}
            className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
          >
            Focus again
          </button>
        )}
        <button
          onClick={pomo.acknowledge}
          title="Dismiss"
          className="rounded p-1 text-slate-500 transition-colors hover:text-slate-300"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex items-center">
      {phase === "idle" ? (
        <button
          onClick={() => setPickerOpen((o) => !o)}
          title="Start a focus session in Notes"
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
            pickerOpen ? "bg-rose-600/20 text-rose-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
        >
          <span aria-hidden className="text-sm leading-none">🍅</span>
          Focus
        </button>
      ) : (
        <div className={`flex items-center gap-1 rounded-lg px-2 py-1 ${phase === "focus" ? "bg-rose-600/15" : "bg-sky-600/15"}`}>
          <span aria-hidden className="text-sm leading-none">{phase === "focus" ? "🍅" : "☕"}</span>
          <span className={`min-w-[3.1rem] text-center font-mono text-xs font-semibold tabular-nums ${paused ? "text-slate-400" : phase === "focus" ? "text-rose-200" : "text-sky-200"}`}>
            {formatMmSs(remainingMs)}
          </span>
          <PomodoroMusicControl />
          <button
            onClick={paused ? pomo.resume : pomo.pause}
            title={paused ? "Resume" : "Pause"}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white"
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          <button
            onClick={pomo.stop}
            title="End session"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-rose-300"
          >
            <Square size={12} />
          </button>
        </div>
      )}

      {/* Duration picker */}
      {pickerOpen && phase === "idle" && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/50">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Focus for</p>
            {FOCUS_OPTIONS.map((min) => (
              <button
                key={min}
                onClick={() => { pomo.start(min); setPickerOpen(false); }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <span>{min} minutes</span>
                {min === 25 && <span className="text-[10px] text-slate-600">classic</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
