"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Braces, Lock, Flame, Play, Database, Zap, RotateCcw,
} from "lucide-react";
import SwarmBackdrop from "./SwarmBackdrop";
import CodeChat from "./CodeChat";
import ProgressHeatmap from "./ProgressHeatmap";
import { PACKS } from "@/lib/code/packs";
import type { DrillLang } from "@/types/code";
import type { PackProgressSummary, PackTier, HeatmapDay } from "@/lib/code/progress";

// The Code landing: what this is → the language you're drilling → your practice
// history (heatmap) → the coding pattern to practise, badged with where you left
// off → a free-form play space. Curated patterns are static packs (lib/code/packs.ts,
// DrillContent shape) — no runtime AI. `data-essentials` is the live warm-up; the
// rest are the analytics-pattern packs. SQL and R patterns come in a later build.
// `progress`/`heatmap` come from app/code/start/page.tsx (server-computed from
// code_drill_attempts) — this component stays a plain prop-in renderer.

const LANGUAGES: { id: DrillLang | "r"; label: string; ready: boolean }[] = [
  { id: "python", label: "Python", ready: true },
  { id: "sql",    label: "SQL",    ready: true },
  { id: "r",      label: "R",      ready: false },
];

const WARMUP_ID = "data-essentials";

const BADGE_STYLES: Record<PackTier, string> = {
  "not-started": "border border-dashed border-slate-700 text-slate-500",
  "in-progress": "bg-sky-500/15 text-sky-300",
  "complete": "bg-emerald-500/15 text-emerald-300",
  "owned": "bg-violet-500/15 text-violet-300",
  "review-due": "bg-amber-500/15 text-amber-300",
};

function PackBadge({ progress }: { progress: PackProgressSummary }) {
  const cls = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_STYLES[progress.tier]}`;
  switch (progress.tier) {
    case "not-started":
      return <span className={cls}>Not started</span>;
    case "in-progress":
      return <span className={cls}>{progress.cellsPassed}/{progress.cellsTotal} done</span>;
    case "complete":
      return <span className={cls}>Complete</span>;
    case "owned":
      return <span className={cls}><Zap size={10} /> Owned</span>;
    case "review-due":
      return <span className={cls}><RotateCcw size={10} /> Review due</span>;
  }
}

export default function CodeLanding({
  progress,
  heatmap,
}: {
  progress?: Record<string, PackProgressSummary>;
  heatmap?: HeatmapDay[];
}) {
  const [activeLang, setActiveLang] = useState<DrillLang>("python");
  const packs = PACKS.filter(p => p.lang === activeLang);
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#0A0F1E] text-slate-200">
      <SwarmBackdrop />

      <header className="relative z-10 flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link href="/home" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft size={14} /> Home
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        {/* What this is */}
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400">Practice · Code</div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">Practise code until it&apos;s muscle memory</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Short, standard coding reps — the same constructs, typed from memory, until they&apos;re automatic.
          Each pattern drills the moves behind a real piece of analytics work. Pick a language, choose a pattern,
          and go — or warm up with the everyday essentials.
        </p>

        {/* Language */}
        <section className="mt-10">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Language</div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(lang => {
              const active = lang.ready && lang.id === activeLang;
              return (
                <button
                  key={lang.id}
                  type="button"
                  disabled={!lang.ready}
                  onClick={() => lang.ready && setActiveLang(lang.id as DrillLang)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                      : lang.ready
                        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300/80 hover:bg-emerald-500/10"
                        : "cursor-not-allowed border-dashed border-slate-800 bg-slate-900/30 text-slate-600"
                  }`}
                >
                  {lang.ready && <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-300" : "bg-emerald-400/60"}`} />}
                  {lang.label}
                  {!lang.ready && <span className="text-[10px] uppercase tracking-wide text-slate-600">· soon</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* Practice history — no streaks, just an honest record of when you showed up */}
        {heatmap && heatmap.length > 0 && (
          <section className="mt-9">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Your practice</div>
            <ProgressHeatmap days={heatmap} />
          </section>
        )}

        {/* Coding patterns */}
        <section className="mt-9">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Coding patterns</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map(pack => {
              const isWarmup = pack.id === WARMUP_ID;
              const Icon = pack.lang === "sql" ? Database : Braces;
              const packProgress = progress?.[pack.id];
              return (
                <Link
                  key={pack.id}
                  href={`/code/drill?pack=${encodeURIComponent(pack.id)}`}
                  className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-slate-900/70"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                      <Icon size={18} />
                    </span>
                    {isWarmup ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        <Flame size={10} /> Warm-up · start here
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400">{pack.tag}</span>
                    )}
                    <span className="ml-auto text-xs text-slate-500">{pack.content.cells.length} reps</span>
                  </div>
                  <h2 className="text-lg font-semibold text-white">{pack.title}</h2>
                  <p className="mt-1 text-sm text-slate-400">{pack.blurb}</p>
                  {packProgress && (
                    <div className="mt-3">
                      <PackBadge progress={packProgress} />
                    </div>
                  )}
                  <span className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
                    Start practising <ArrowRight size={12} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Play */}
        <section className="mt-9">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Play</div>
          <div className="flex cursor-not-allowed select-none items-center gap-4 rounded-2xl border border-dashed border-slate-800/70 bg-slate-900/20 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800/60 text-slate-600">
              <Play size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-500">Play environment</h2>
                <span className="flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-600">
                  <Lock size={9} /> Soon
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">A free-form Python sandbox — write and run anything, no drill, no clock.</p>
            </div>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-slate-600">
          More patterns land soon. The goal is muscle memory — repeat until the syntax is automatic.
        </p>
      </main>

      <CodeChat />
    </div>
  );
}
