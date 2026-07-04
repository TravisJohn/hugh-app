"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, Rocket, Trophy, Lock, LogIn, UserPlus } from "lucide-react";

export default function FeatureCards() {
  const [active, setActive] = useState(false);

  const authButtons = (
    <div className="flex flex-col gap-2 pt-1">
      <Link
        href="/login"
        onClick={e => e.stopPropagation()}
        className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500"
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

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

      {/* Learn — the whole live experience */}
      <div
        onClick={() => setActive(prev => !prev)}
        className={`group relative overflow-hidden rounded-2xl border bg-slate-800/30 p-6 cursor-pointer select-none transition-all duration-300 hover:-translate-y-1 hover:bg-slate-800/60 hover:shadow-xl
          ${active
            ? "border-green-500/40 bg-slate-800/60 -translate-y-1 shadow-xl shadow-green-500/10"
            : "border-slate-700/50 hover:border-green-500/40 hover:shadow-green-500/10"
          }`}
      >
        <div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/5 to-transparent transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
        <div className="relative">
          <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-green-400/10 text-green-400 transition-transform duration-300 ${active ? "scale-110" : "group-hover:scale-110"}`}>
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Learn</span>
            <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              Live
            </span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-400">
            Follow an AI-mapped track, ask Hugh anything on your topic, and practise
            out loud — everything you need to actually know your stuff.
          </p>
          {active ? authButtons : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-green-400 transition-all group-hover:gap-2">
              Start learning <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </span>
          )}
        </div>
      </div>

      {/* Apply — coming soon */}
      <div className="group relative overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 select-none">
        <div className="relative">
          <div className="absolute top-0 right-0 flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-1 text-xs text-slate-500">
            <Lock size={10} />
            Coming soon
          </div>
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-700/40 text-slate-500">
            <Rocket className="h-5 w-5" />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-300">Apply</span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            Put your learning to work on real, hands-on challenges scoped to your
            topic — proof you can use what you know.
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-600">
            Coming soon
          </span>
        </div>
      </div>

      {/* Show — coming soon */}
      <div className="group relative overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 select-none">
        <div className="relative">
          <div className="absolute top-0 right-0 flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-1 text-xs text-slate-500">
            <Lock size={10} />
            Coming soon
          </div>
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-700/40 text-slate-500">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-300">Show</span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            Demonstrate what you&apos;ve mastered and build a record of what you can
            do — ready to share when it counts.
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-600">
            Coming soon
          </span>
        </div>
      </div>

    </div>
  );
}
