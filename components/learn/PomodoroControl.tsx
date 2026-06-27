"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { formatMmSs, type PomodoroApi } from "@/hooks/usePomodoro";

interface Props {
  pomo: PomodoroApi;
}

const FOCUS_OPTIONS = [15, 25, 50];

// Gentle two-tone chime via Web Audio — no asset needed. Best-effort: browsers
// block audio until the user has interacted, which they always have here (they
// clicked to start the timer), so it plays on completion.
function playChime() {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.start(t);
      osc.stop(t + 0.42);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* audio not available — toast still shows */ }
}

/**
 * Focus-timer widget for the Ask toolbar. Idle: a tomato that opens a duration
 * picker. Running: a live countdown with pause/stop. On completion: a chime and
 * a dismissible toast that offers a 5-minute break (or, after a break, another
 * focus block). Never blocks the learner.
 */
export default function PomodoroControl({ pomo }: Props) {
  const { phase, remainingMs, paused, completed } = pomo;
  const [pickerOpen, setPickerOpen] = useState(false);

  // Chime once per completion. Ref-guard so a re-render with the same `completed`
  // value (or React's dev double-invoke) doesn't double-play.
  const chimedFor = useRef<"focus" | "break" | null>(null);
  useEffect(() => {
    if (!completed) { chimedFor.current = null; return; }
    if (chimedFor.current === completed) return;
    chimedFor.current = completed;
    playChime();
  }, [completed]);

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

      {/* Completion toast */}
      {completed && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-toast-in">
          <div className="flex items-center gap-3 rounded-2xl border border-rose-500/40 bg-[#1a0f12] px-5 py-4 shadow-2xl shadow-black/60 backdrop-blur-sm">
            <span aria-hidden className="text-lg leading-none">{completed === "focus" ? "🍅" : "☕"}</span>
            <div>
              <p className="text-sm font-semibold text-rose-200">
                {completed === "focus" ? "Focus block done" : "Break's over"}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {completed === "focus" ? "Nice work — take a breather?" : "Ready for another focus block?"}
              </p>
            </div>
            {completed === "focus" ? (
              <button
                onClick={pomo.startBreak}
                className="ml-1 shrink-0 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition-colors"
              >
                5-min break
              </button>
            ) : (
              <button
                onClick={() => pomo.start(25)}
                className="ml-1 shrink-0 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors"
              >
                Focus again
              </button>
            )}
            <button
              onClick={pomo.acknowledge}
              title="Dismiss"
              className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
