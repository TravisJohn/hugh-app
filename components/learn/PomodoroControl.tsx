"use client";

import { useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { formatMmSs, type PomodoroApi } from "@/hooks/usePomodoro";

interface Props {
  pomo: PomodoroApi;
}

const FOCUS_OPTIONS = [15, 25, 50];

/**
 * Focus-timer control for the Ask toolbar. Idle: a tomato that opens a duration
 * picker to start a session. Running: a live countdown with pause/stop. The
 * completion chime and break toast are handled globally by the PomodoroDock, so
 * they fire (and the timer stays visible) on any page — not just here.
 */
export default function PomodoroControl({ pomo }: Props) {
  const { phase, remainingMs, paused } = pomo;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="relative flex items-center">
      {phase === "idle" ? (
        <button
          onClick={() => setPickerOpen(o => !o)}
          title="Start a focus session"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            pickerOpen ? "bg-rose-600/20 text-rose-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
        >
          <span aria-hidden className="text-sm leading-none">🍅</span>
          Focus
        </button>
      ) : (
        <div className={`flex items-center gap-1 rounded-lg px-2 py-1 ${phase === "focus" ? "bg-rose-600/15" : "bg-sky-600/15"}`}>
          <span aria-hidden className="text-sm leading-none">{phase === "focus" ? "🍅" : "☕"}</span>
          <span className={`min-w-[3.1rem] text-center font-mono text-xs font-semibold tabular-nums ${phase === "focus" ? "text-rose-200" : "text-sky-200"}`}>
            {formatMmSs(remainingMs)}
          </span>
          <button
            onClick={paused ? pomo.resume : pomo.pause}
            title={paused ? "Resume" : "Pause"}
            className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          <button
            onClick={pomo.stop}
            title="End session"
            className="rounded p-1 text-slate-400 hover:text-rose-300 hover:bg-slate-700/60 transition-colors"
          >
            <Square size={12} />
          </button>
        </div>
      )}

      {/* Duration picker */}
      {pickerOpen && phase === "idle" && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-2 w-44 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/50">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Focus for</p>
            {FOCUS_OPTIONS.map(min => (
              <button
                key={min}
                onClick={() => { pomo.start(min); setPickerOpen(false); }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
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
