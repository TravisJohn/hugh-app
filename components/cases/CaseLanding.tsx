import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { CaseProgress, Manifest } from "@/types/cases";
import CaseCard from "./CaseCard";

/**
 * The Case Room library — a blog-style index of cases. Unlike the player (which
 * is viewport-fit), this is a normal scrolling content page: a header title,
 * an intro line, and a grid of case "posts".
 */
export default function CaseLanding({
  manifest,
  progress,
}: {
  manifest: Manifest;
  progress: Record<string, CaseProgress>;
}) {
  const count = manifest.cases.length;
  return (
    <div className="min-h-screen bg-[#0A0F1E] text-slate-200">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link
          href="/home"
          className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft size={14} />
          Home
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>

      {/* Blog header + grid */}
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400">
          Show · The Case Room
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">
          The Case Room
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Real business cases where the mechanical work is done for you. Make the calls
          that actually matter, then see your judgment A/B-tested against an expert&apos;s.
          {" "}
          <span className="text-slate-500">
            {count} case{count === 1 ? "" : "s"} this batch.
          </span>
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {manifest.cases.map((stub) => (
            <CaseCard key={stub.id} stub={stub} progress={progress[stub.id]} />
          ))}
        </div>
      </main>
    </div>
  );
}
