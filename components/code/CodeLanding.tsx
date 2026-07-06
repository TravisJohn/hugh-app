"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, GraduationCap, Wand2, BookOpen, PenLine,
  MessageCircle, ChevronLeft, Sparkles,
} from "lucide-react";
import SwarmBackdrop from "./SwarmBackdrop";
import CodeChat from "./CodeChat";

// THROWAWAY SPIKE — the Code landing. Two ways in: practise something you've been
// learning, or spin up your own. "From your learnings" is fed real tracks/milestones
// from the server (see app/code/start/page.tsx); "Create your own" stays a light
// flow. Both paths open the sample drill (/code/drill) until the generator exists.

const DRILL = "/code/drill"; // placeholder target for every path

type Kind = "milestone" | "diary" | "session";
const KIND_ICON: Record<Kind, typeof BookOpen> = { milestone: BookOpen, diary: PenLine, session: MessageCircle };

export type Learning = { id: string; kind: Kind; label: string; meta: string };

const FOCUS_CHIPS = ["Syntax & basics", "Transforming data", "Aggregating / grouping", "A specific function"];

export default function CodeLanding({ learnings }: { learnings: Learning[] }) {
  // "Create your own" light Socratic flow: topic → one refining question → build.
  const [topic, setTopic] = useState("");
  const [step, setStep]   = useState<0 | 1>(0);
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0F1E] text-slate-200">
      <SwarmBackdrop />

      <header className="relative z-10 flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link href="/home" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft size={14} /> Home
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400">Practice · Code</div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">What do you want to practise?</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Short, timed coding reps to build muscle memory. Start from something you&apos;ve been
          learning, or spin up your own — Hugh turns it into a drill you type from memory.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {/* ── From your learnings ─────────────────────────────── */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <GraduationCap size={18} />
              </span>
              <h2 className="text-lg font-semibold text-white">From your learnings</h2>
            </div>
            <p className="mb-4 text-sm text-slate-400">
              Practise what you&apos;ve studied — pulled from your tracks and milestones.
            </p>
            {learnings.length > 0 ? (
              <div className="space-y-2">
                {learnings.map(item => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <Link
                      key={item.id}
                      href={DRILL}
                      className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3.5 py-2.5 transition-colors hover:border-emerald-500/40 hover:bg-slate-900/70"
                    >
                      <Icon size={15} className="shrink-0 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-200">{item.label}</div>
                        <div className="truncate text-xs text-slate-500">{item.meta}</div>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
                        Practise <ArrowRight size={12} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center">
                <p className="text-sm text-slate-400">Nothing to practise yet.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Study a track and your milestones show up here. In the meantime, create your own drill on the right.
                </p>
                <Link href="/home/learn" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300">
                  Start a track <ArrowRight size={12} />
                </Link>
              </div>
            )}
          </section>

          {/* ── Create your own ─────────────────────────────────── */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                <Wand2 size={18} />
              </span>
              <h2 className="text-lg font-semibold text-white">Create your own</h2>
            </div>
            <p className="mb-4 text-sm text-slate-400">
              Tell Hugh what you want to nail. A couple of quick questions and he&apos;ll build a drill for it.
            </p>

            {step === 0 ? (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-500">What do you want to practise?</label>
                <textarea
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  rows={3}
                  placeholder="e.g. grouping rows and summing a column, or reversing a string…"
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                />
                <button
                  onClick={() => setStep(1)}
                  disabled={!topic.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                  Next <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={() => setStep(0)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
                  <ChevronLeft size={13} /> Back
                </button>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                  <div className="flex items-start gap-2">
                    <Sparkles size={15} className="mt-0.5 shrink-0 text-violet-400" />
                    <p className="text-sm text-slate-300">
                      Got it — <span className="font-medium text-white">{topic.trim()}</span>. To pitch it right,
                      what should the drill lean into?
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {FOCUS_CHIPS.map(c => (
                      <button
                        key={c}
                        onClick={() => setFocus(c)}
                        className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                          focus === c
                            ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                            : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <Link
                  href={DRILL}
                  aria-disabled={!focus}
                  onClick={e => { if (!focus) e.preventDefault(); }}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors ${
                    focus ? "bg-violet-600 hover:bg-violet-500" : "cursor-not-allowed bg-slate-800 text-slate-500"
                  }`}
                >
                  <Wand2 size={15} /> Build my drill
                </Link>
              </div>
            )}
          </section>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Spike — every path opens the sample drill for now; on-demand generation comes next.
        </p>
      </main>

      <CodeChat />
    </div>
  );
}
