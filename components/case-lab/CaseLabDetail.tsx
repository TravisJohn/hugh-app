"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Database,
  Clock,
  ListChecks,
  Compass,
  Eye,
  EyeOff,
  AlertTriangle,
  Search,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import type { CaseLabCase } from "@/types/case-lab";

/**
 * The Case Lab case page. Presents the brief, guiding questions, and the dataset
 * (schema + a static sample preview + a download link to the full CSV), then a
 * teaching note the learner reveals ON DEMAND so they don't spoil themselves.
 * A normal scrolling page — a deliberate exception to the no-scroll rule, like
 * the case library.
 */
export default function CaseLabDetail({ c }: { c: CaseLabCase }) {
  const [revealed, setRevealed] = useState(false);
  const { scenario, dataset, teachingNote } = c;

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-slate-200">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link
          href="/cases/lab"
          className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft size={14} />
          The Case Lab
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Title block */}
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-semibold text-emerald-400">
            {c.trap}
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <Database size={12} />
            {dataset.rows.toLocaleString()} rows
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <Clock size={12} />~{c.estMinutes} min
          </span>
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white">
          {c.title}
        </h1>

        {/* Scenario */}
        <section className="mt-6 space-y-4">
          <p className="text-sm font-semibold text-slate-300">
            {scenario.role} · <span className="text-slate-500">{scenario.company}</span>
          </p>
          <p className="leading-relaxed text-slate-300">{scenario.situation}</p>
          <blockquote className="border-l-2 border-amber-500/50 bg-amber-500/5 py-3 pl-4 text-slate-300 italic">
            {scenario.stakeholderBelief}
          </blockquote>
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
              Your call
            </p>
            <p className="mt-1 leading-relaxed text-slate-200">{scenario.question}</p>
          </div>
        </section>

        {/* Guiding questions */}
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
            <ListChecks size={15} />
            Work through these
          </h2>
          <ol className="mt-4 space-y-3">
            {c.guidingQuestions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-400">
                  {i + 1}
                </span>
                <span className="leading-relaxed text-slate-300">{q}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Suggested approach — non-spoiling method scaffold (optional) */}
        {c.suggestedApproach && c.suggestedApproach.length > 0 && (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
              <Compass size={15} />
              Suggested approach
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Not sure where to start? A recommended route — it doesn&apos;t give the
              answer away.
            </p>
            <ul className="mt-3 space-y-2.5">
              {c.suggestedApproach.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70" />
                  {step}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Dataset */}
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
              <Database size={15} />
              The dataset
            </h2>
            <a
              href={dataset.file}
              download
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              <Download size={15} />
              Download CSV ({dataset.rows.toLocaleString()} rows)
            </a>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Take it away and analyse it however you like — a notebook, a spreadsheet,
            or your favourite AI. Preview of the first {dataset.sample.length} rows:
          </p>

          {/* Sample preview — scrolls horizontally inside its own container. */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  {dataset.columns.map((col) => (
                    <th key={col.name} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {dataset.sample.map((row, i) => (
                  <tr key={i} className="border-t border-slate-800/60">
                    {dataset.columns.map((col) => (
                      <td key={col.name} className="whitespace-nowrap px-3 py-1.5">
                        {String(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Schema / column guide */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {dataset.columns.map((col) => (
              <div key={col.name} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-emerald-300">
                    {col.name}
                  </code>
                  <span className="text-[10px] uppercase tracking-wide text-slate-600">
                    {col.type}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  {col.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Teaching note — revealed on demand */}
        <section className="mt-12">
          {!revealed ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
              <Lightbulb className="mx-auto text-amber-400" size={24} />
              <p className="mt-3 font-semibold text-slate-200">
                Worked the case? Reveal the expert teaching note.
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Do your own analysis first — the payoff is comparing your reasoning
                against the expert&apos;s, not reading the answer cold.
              </p>
              <button
                onClick={() => setRevealed(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20"
              >
                <Eye size={16} />
                Reveal teaching note
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-serif text-2xl font-bold text-white">
                  <Lightbulb className="text-amber-400" size={22} />
                  Teaching note
                </h2>
                <button
                  onClick={() => setRevealed(false)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
                >
                  <EyeOff size={14} />
                  Hide
                </button>
              </div>

              <NoteBlock
                icon={<Search size={16} className="text-slate-400" />}
                title="The naive read"
                tone="slate"
              >
                {teachingNote.naiveRead}
              </NoteBlock>

              <NoteBlock
                icon={<AlertTriangle size={16} className="text-amber-400" />}
                title="The trap"
                tone="amber"
              >
                {teachingNote.theTrap}
              </NoteBlock>

              <NoteBlock
                icon={<CheckCircle2 size={16} className="text-emerald-400" />}
                title="The honest answer"
                tone="emerald"
              >
                {teachingNote.honestAnswer}
              </NoteBlock>

              {/* Key numbers */}
              <div className="grid gap-3 sm:grid-cols-2">
                {teachingNote.numbers.map((n) => (
                  <div key={n.label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                    <p className="text-xs text-slate-500">{n.label}</p>
                    <p className="mt-1 font-serif text-xl font-bold text-white">{n.value}</p>
                  </div>
                ))}
              </div>

              {/* Method */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                  How to get there
                </h3>
                <ol className="mt-3 space-y-2">
                  {teachingNote.howToGetThere.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-400">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed text-slate-300">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Lesson */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                  The lesson
                </p>
                <p className="mt-2 leading-relaxed text-slate-200">{teachingNote.lesson}</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function NoteBlock({
  icon,
  title,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: "slate" | "amber" | "emerald";
  children: ReactNode;
}) {
  const border = {
    slate: "border-slate-800",
    amber: "border-amber-500/30",
    emerald: "border-emerald-500/30",
  }[tone];
  return (
    <div className={`rounded-2xl border ${border} bg-slate-900/40 p-5`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        {icon}
        {title}
      </p>
      <p className="mt-2 leading-relaxed text-slate-300">{children}</p>
    </div>
  );
}
