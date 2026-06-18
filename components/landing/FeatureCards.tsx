"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp, MessageCircle, Mic, Lock, LogIn, UserPlus } from "lucide-react";

type CardId = "track" | "ask" | "converse";

export default function FeatureCards() {
  const [active, setActive] = useState<CardId | null>(null);

  function toggle(id: CardId) {
    setActive(prev => (prev === id ? null : id));
  }

  const authButtons = (color: "green" | "violet" | "sky") => {
    const bg: Record<typeof color, string> = {
      green:  "bg-green-600 hover:bg-green-500",
      violet: "bg-violet-600 hover:bg-violet-500",
      sky:    "bg-sky-600 hover:bg-sky-500",
    };
    return (
      <div className="flex flex-col gap-2 pt-1">
        <Link
          href="/login"
          onClick={e => e.stopPropagation()}
          className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${bg[color]}`}
        >
          <LogIn size={13} />
          Sign in
        </Link>
        <Link
          href="/signup"
          onClick={e => e.stopPropagation()}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
        >
          <UserPlus size={13} />
          Create account
        </Link>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

      {/* Track */}
      <div
        onClick={() => toggle("track")}
        className={`group relative overflow-hidden rounded-2xl border bg-slate-800/30 p-6 cursor-pointer select-none transition-all duration-300 hover:-translate-y-1 hover:bg-slate-800/60 hover:shadow-xl
          ${active === "track"
            ? "border-green-500/40 bg-slate-800/60 -translate-y-1 shadow-xl shadow-green-500/10"
            : "border-slate-700/50 hover:border-green-500/40 hover:shadow-green-500/10"
          }`}
      >
        <div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/5 to-transparent transition-opacity duration-300 ${active === "track" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
        <div className="relative">
          <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-green-400/10 text-green-400 transition-transform duration-300 ${active === "track" ? "scale-110" : "group-hover:scale-110"}`}>
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Track</span>
            <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              Live
            </span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-400">
            AI-mapped learning milestones on a kanban board. Log your thoughts as you go — know exactly where you stand.
          </p>
          {active === "track" ? authButtons("green") : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-green-400 transition-all group-hover:gap-2">
              Open tracker <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </span>
          )}
        </div>
      </div>

      {/* Ask */}
      <div
        onClick={() => toggle("ask")}
        className={`group relative overflow-hidden rounded-2xl border bg-slate-800/30 p-6 cursor-pointer select-none transition-all duration-300 hover:-translate-y-1 hover:bg-slate-800/60 hover:shadow-xl
          ${active === "ask"
            ? "border-violet-500/40 bg-slate-800/60 -translate-y-1 shadow-xl shadow-violet-500/10"
            : "border-slate-700/50 hover:border-violet-500/40 hover:shadow-violet-500/10"
          }`}
      >
        <div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/5 to-transparent transition-opacity duration-300 ${active === "ask" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
        <div className="relative">
          <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/10 text-violet-400 transition-transform duration-300 ${active === "ask" ? "scale-110" : "group-hover:scale-110"}`}>
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Ask</span>
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
              Live
            </span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-400">
            A tutor scoped to one topic. Ask freely — Hugh keeps you on track and redirects if you drift.
          </p>
          {active === "ask" ? authButtons("violet") : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-violet-400 transition-all group-hover:gap-2">
              Start learning <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </span>
          )}
        </div>
      </div>

      {/* Converse — locked */}
      <div
        onClick={() => toggle("converse")}
        className={`group relative overflow-hidden rounded-2xl border bg-slate-800/30 p-6 cursor-pointer select-none transition-all duration-300 hover:-translate-y-1 hover:bg-slate-800/60 hover:shadow-xl
          ${active === "converse"
            ? "border-sky-500/30 bg-slate-800/60 -translate-y-1 shadow-xl shadow-sky-500/10"
            : "border-slate-700/50 hover:border-sky-500/30 hover:shadow-sky-500/10"
          }`}
      >
        <div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/5 to-transparent transition-opacity duration-300 ${active === "converse" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
        <div className="relative">
          <div className="absolute top-0 right-0 flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-1 text-xs text-slate-500">
            <Lock size={10} />
            Coming soon
          </div>
          <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-400 transition-transform duration-300 ${active === "converse" ? "scale-110" : "group-hover:scale-110"}`}>
            <Mic className="h-5 w-5" />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Converse</span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-400">
            Apply what you learn in a situational business conversation with Hugh — see if you can truly use it.
          </p>
          {active === "converse" ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              Converse unlocks as you build learning history. Keep tracking and asking — Hugh will let you know when it&apos;s ready.
            </p>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-600">
              Coming soon
            </span>
          )}
        </div>
      </div>

    </div>
  );
}
