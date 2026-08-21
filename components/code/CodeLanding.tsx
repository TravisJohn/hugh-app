"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Play } from "lucide-react";
import SwarmBackdrop from "./SwarmBackdrop";
import CodeChat from "./CodeChat";
import ProgressHeatmap from "./ProgressHeatmap";
import PatternMap from "./PatternMap";
import { PACKS } from "@/lib/code/packs";
import { groupsForLang } from "@/lib/code/groups";
import type { HeatReading } from "@/lib/code/heat";
import type { DrillLang } from "@/types/code";
import type { PackProgressSummary, HeatmapDay } from "@/lib/code/progress";

// The Code landing: what this is → the language you're drilling → your practice
// history (heatmap) → the pattern map → a free-form play space. Curated patterns
// are static packs (lib/code/packs.ts, DrillContent shape) — no runtime AI.
// `progress`/`heatmap`/`groupHeat` come from app/code/start/page.tsx
// (server-computed from code_drill_attempts) — this stays a prop-in renderer.
//
// Opening a group on the map is a TAKEOVER: the hero copy, practice heatmap and
// Play section collapse so the branch gets the whole viewport, which is what
// keeps the page inside the no-scroll rule with up to 8 leaves. The language
// pills deliberately stay put — SQL has a single group and so opens expanded,
// and collapsing the pills with everything else would strand the learner there
// with no way back to Python.

const LANGUAGES: { id: DrillLang | "r"; label: string; ready: boolean }[] = [
  { id: "python",     label: "Python",     ready: true },
  { id: "sql",        label: "SQL",        ready: true },
  { id: "javascript", label: "JavaScript", ready: true },
  { id: "r",          label: "R",          ready: false },
];

export default function CodeLanding({
  progress,
  heatmap,
  groupHeat,
  packHeat,
}: {
  progress?: Record<string, PackProgressSummary>;
  heatmap?: HeatmapDay[];
  /** Group heat per language — the pill decides which set is read. */
  groupHeat?: Record<DrillLang, Record<string, HeatReading>>;
  /** Per-pack heat, for the gauge on each leaf. */
  packHeat?: Record<string, HeatReading>;
}) {
  const [activeLang, setActiveLang] = useState<DrillLang>("python");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Territories for the active language. Groups with no packs in this language
  // are dropped rather than rendered as cells that branch into nothing.
  const groups = groupsForLang(activeLang);
  const langGroupHeat = groupHeat?.[activeLang];

  // A language with a single territory has no choice to offer, so it opens
  // straight into its branch instead of showing a lone cell in a 3-up grid.
  const effectiveSelectedId = groups.length === 1 ? groups[0].id : selectedGroupId;
  const expanded = effectiveSelectedId !== null;

  // Switching language always returns to the grid: the open group may not exist
  // in the new language at all, and even when it does the leaves are different.
  function switchLang(lang: DrillLang) {
    setActiveLang(lang);
    setSelectedGroupId(null);
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#0A0F1E] text-slate-200">
      <SwarmBackdrop />

      <header className="relative z-10 flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link href="/home" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft size={14} /> Home
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-5 [@media(max-height:830px)]:py-3">
        {/* What this is — collapses on expand so the branch owns the viewport. */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            expanded ? "max-h-0 -translate-y-2 opacity-0" : "max-h-52 opacity-100"
          }`}
        >
          {/* Below ~830px of viewport height there isn't room for the full hero AND
              six cells AND the Play row without scrolling, and the no-scroll rule
              outranks the intro copy. Height media queries shed the least
              load-bearing parts first: the eyebrow, then the standfirst. */}
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400 [@media(max-height:830px)]:hidden">Practice · Code</div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-white sm:text-3xl">Practise code until it&apos;s muscle memory</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 [@media(max-height:830px)]:hidden">
            Short, standard coding reps — the same constructs, typed from memory, until they&apos;re
            automatic. Pick a language, choose an area, and go.
          </p>
        </div>

        {/* Language and practice history share a row: two small blocks that
            would each waste a full band of vertical space stacked, and the page
            has to fit the viewport without scrolling. */}
        <div className={`flex flex-wrap items-start justify-between gap-x-10 gap-y-5 ${expanded ? "" : "mt-6"}`}>
        {/* Language — deliberately NOT collapsed; see the note at the top. */}
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Language</div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(lang => {
              const active = lang.ready && lang.id === activeLang;
              return (
                <button
                  key={lang.id}
                  type="button"
                  disabled={!lang.ready}
                  onClick={() => lang.ready && switchLang(lang.id as DrillLang)}
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

        {/* Practice history — no streaks, just an honest record of when you
            showed up. Collapses on expand. */}
        {heatmap && heatmap.length > 0 && (
          <div
            className={`overflow-hidden transition-all duration-300 ${
              expanded ? "max-h-0 w-0 opacity-0" : "max-h-52 opacity-100"
            }`}
          >
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Your practice</div>
              <ProgressHeatmap days={heatmap} />
            </section>
          </div>
        )}
        </div>

        {/* The pattern map — territories, then one opened into its packs. */}
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Coding patterns</div>
            <div className="text-[11px] text-slate-600">
              {groups.length} {groups.length === 1 ? "area" : "areas"}
            </div>
          </div>

          <PatternMap
            groups={groups}
            packs={PACKS}
            lang={activeLang}
            groupHeat={langGroupHeat}
            packHeat={packHeat}
            progress={progress}
            selectedId={effectiveSelectedId}
            onSelect={setSelectedGroupId}
          />
        </section>

        {/* Play — collapses on expand, same as the hero and heatmap. */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            expanded ? "max-h-0 opacity-0" : "max-h-56 opacity-100"
          }`}
        >
        <section className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Play</div>
          {/* Kept to one line: it's a disabled placeholder, and the vertical
              space it was taking is what pushed the grid past the viewport on
              shorter laptops. */}
          <div className="flex cursor-not-allowed select-none flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-slate-800/70 bg-slate-900/20 px-4 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/60 text-slate-600">
              <Play size={14} />
            </span>
            <h2 className="text-sm font-semibold text-slate-500">Play environment</h2>
            <span className="flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-600">
              <Lock size={9} /> Soon
            </span>
            <p className="min-w-0 text-xs text-slate-600">A free-form Python sandbox — write and run anything, no drill, no clock.</p>
          </div>
        </section>

        </div>
      </main>

      <CodeChat />
    </div>
  );
}
