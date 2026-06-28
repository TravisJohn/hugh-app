"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { GripVertical, Pause, Play, Square, X } from "lucide-react";
import { formatMmSs } from "@/hooks/usePomodoro";
import { isSilentRoute, isAskRoute } from "@/lib/pomodoro/routes";
import { usePomodoroContext } from "./PomodoroProvider";
import PomodoroMusicControl from "./PomodoroMusicControl";

// Persisted drag position for the floating countdown (null = default corner).
const POS_KEY = "hugh:pomodoro:pos";
interface Pos { x: number; y: number }

function readPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    return raw ? (JSON.parse(raw) as Pos) : null;
  } catch { return null; }
}
function writePos(p: Pos | null) {
  try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// Gentle two-tone chime via Web Audio — no asset needed. Best-effort; browsers
// allow it because the learner clicked to start the timer earlier.
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
 * Global, persistent Pomodoro presence. Shows a floating countdown wherever a
 * session is running (so the learner is reminded on Kanban, while writing a diary
 * entry, etc.), and surfaces the completion chime + break toast. Stays out of the
 * way on focused-assessment routes and on the Ask page (which has its own control).
 */
export default function PomodoroDock() {
  const pomo     = usePomodoroContext();
  const pathname = usePathname() ?? "";
  const { phase, remainingMs, paused, completed } = pomo;

  const silent = isSilentRoute(pathname);
  const ask    = isAskRoute(pathname);

  // Draggable position. Lazy-init from localStorage (the dock renders nothing on
  // first paint — phase is idle until the session hydrates — so there's no SSR
  // mismatch). null = default bottom-right corner.
  const [pos, setPos] = useState<Pos | null>(() => (typeof window === "undefined" ? null : readPos()));
  const dockRef  = useRef<HTMLDivElement>(null);
  const dragRef  = useRef<{ ox: number; oy: number } | null>(null);
  const posRef   = useRef<Pos | null>(pos);

  function startDrag(e: React.PointerEvent) {
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { ox: e.clientX - rect.left, oy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    const rect = dockRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const x = Math.min(Math.max(0, e.clientX - d.ox), window.innerWidth  - rect.width);
    const y = Math.min(Math.max(0, e.clientY - d.oy), window.innerHeight - rect.height);
    const next = { x, y };
    posRef.current = next;
    setPos(next);
  }
  function endDrag(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    writePos(posRef.current);
  }

  // Chime once per completion (ref-guarded against re-renders / dev double-invoke).
  const chimedFor = useRef<"focus" | "break" | null>(null);
  useEffect(() => {
    if (!completed) { chimedFor.current = null; return; }
    if (silent) return;                       // silent routes: no chime
    if (chimedFor.current === completed) return;
    chimedFor.current = completed;
    playChime();
  }, [completed, silent]);

  const showCountdown = !silent && !ask && phase !== "idle";
  const showToast     = !silent && !!completed;

  return (
    <>
      {/* Floating countdown — the persistent reminder (draggable) */}
      {showCountdown && (
        <div
          ref={dockRef}
          className={`fixed z-50 select-none animate-fadeIn ${pos ? "" : "bottom-6 right-6"}`}
          style={pos ? { left: pos.x, top: pos.y } : undefined}
        >
          <div className={`flex items-center gap-1.5 rounded-2xl border py-2 pl-1.5 pr-3 shadow-2xl shadow-black/50 backdrop-blur-sm ${
            phase === "focus" ? "border-rose-500/40 bg-[#1a0f12]/90" : "border-sky-500/40 bg-[#0b1622]/90"
          }`}>
            <button
              type="button"
              onPointerDown={startDrag}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              title="Drag to move"
              aria-label="Move timer"
              className="cursor-grab touch-none rounded p-0.5 text-slate-500 hover:text-slate-300 active:cursor-grabbing"
            >
              <GripVertical size={14} />
            </button>
            <span aria-hidden className="text-base leading-none">{phase === "focus" ? "🍅" : "☕"}</span>
            <span className={`min-w-[3.1rem] text-center font-mono text-sm font-semibold tabular-nums ${
              paused ? "text-slate-400" : phase === "focus" ? "text-rose-200" : "text-sky-200"
            }`}>
              {formatMmSs(remainingMs)}
            </span>
            <PomodoroMusicControl />
            <button
              onClick={paused ? pomo.resume : pomo.pause}
              title={paused ? "Resume" : "Pause"}
              className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
            </button>
            <button
              onClick={pomo.stop}
              title="End session"
              className="rounded p-1 text-slate-400 hover:text-rose-300 hover:bg-slate-700/60 transition-colors"
            >
              <Square size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Completion toast */}
      {showToast && (
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
    </>
  );
}
