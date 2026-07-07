"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Braces, Lock } from "lucide-react";
import SwarmBackdrop from "./SwarmBackdrop";
import CodeChat from "./CodeChat";
import { PACKS } from "@/lib/code/packs";

// The Code landing — a picker of curated practice packs. Each pack is a set of
// bite-size, repeatable construct reps (see lib/code/packs.ts). Pick one → drill
// it from memory. Kept deliberately simple: no per-topic AI generation here.

const COMING_SOON = [
  { title: "Python basics", blurb: "Comprehensions, dicts, slicing, unpacking — the core syntax." },
  { title: "SQL patterns", blurb: "SELECT / WHERE / GROUP BY / JOIN, written from memory." },
];

export default function CodeLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0F1E] text-slate-200">
      <SwarmBackdrop />

      <header className="relative z-10 flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link href="/home" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft size={14} /> Home
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-6 py-12">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400">Practice · Code</div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">What do you want to practise?</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Short, standard coding reps — the same constructs, typed from memory, until they&apos;re automatic.
          Pick a pack and go.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {PACKS.map(pack => (
            <Link
              key={pack.id}
              href={`/code/drill?pack=${encodeURIComponent(pack.id)}`}
              className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-slate-900/70"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Braces size={18} />
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400">{pack.tag}</span>
                <span className="ml-auto text-xs text-slate-500">{pack.content.cells.length} reps</span>
              </div>
              <h2 className="text-lg font-semibold text-white">{pack.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{pack.blurb}</p>
              <span className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
                Start practising <ArrowRight size={12} />
              </span>
            </Link>
          ))}

          {COMING_SOON.map(p => (
            <div
              key={p.title}
              className="flex cursor-not-allowed select-none flex-col rounded-2xl border border-dashed border-slate-800/70 bg-slate-900/20 p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/60 text-slate-600">
                  <Braces size={18} />
                </span>
                <span className="ml-auto flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-600">
                  <Lock size={9} /> Soon
                </span>
              </div>
              <h2 className="text-lg font-semibold text-slate-500">{p.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{p.blurb}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          More packs coming. The goal is muscle memory — repeat a pack until the syntax is automatic.
        </p>
      </main>

      <CodeChat />
    </div>
  );
}
