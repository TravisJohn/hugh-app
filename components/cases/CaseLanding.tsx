"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, X, SlidersHorizontal } from "lucide-react";
import {
  FACET_KEYS,
  FACET_LABELS,
  type CaseProgress,
  type CaseStub,
  type FacetKey,
  type Manifest,
} from "@/types/cases";
import CaseCard from "./CaseCard";

/** A case's values for one facet (single facets are wrapped to an array). */
function valuesOf(stub: CaseStub, key: FacetKey): string[] {
  const v = stub.facets[key];
  return Array.isArray(v) ? v : [v];
}

type Selected = Record<FacetKey, string[]>;
const EMPTY: Selected = { about: [], industry: [], modelling: [], statistics: [] };

/**
 * The Case Room library — a blog-style index with a right-hand facet filter
 * (About / Industry / Modelling use / Statistics). Filtering is client-side over
 * the manifest (tens of cases → trivial): OR within a facet, AND across facets.
 * A normal scrolling content page (unlike the viewport-fit player).
 */
export default function CaseLanding({
  manifest,
  progress,
}: {
  manifest: Manifest;
  progress: Record<string, CaseProgress>;
}) {
  const [selected, setSelected] = useState<Selected>(EMPTY);

  // Distinct values + counts per facet, most common first.
  const facetOptions = useMemo(() => {
    const out = {} as Record<FacetKey, { value: string; count: number }[]>;
    for (const key of FACET_KEYS) {
      const counts = new Map<string, number>();
      for (const stub of manifest.cases)
        for (const v of valuesOf(stub, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
      out[key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    return out;
  }, [manifest]);

  const filtered = useMemo(
    () =>
      manifest.cases.filter((stub) =>
        FACET_KEYS.every((key) => {
          const sel = selected[key];
          return sel.length === 0 || valuesOf(stub, key).some((v) => sel.includes(v));
        }),
      ),
    [manifest, selected],
  );

  const activeCount = FACET_KEYS.reduce((n, k) => n + selected[k].length, 0);

  function toggle(key: FacetKey, value: string) {
    setSelected((s) => {
      const has = s[key].includes(value);
      return { ...s, [key]: has ? s[key].filter((v) => v !== value) : [...s[key], value] };
    });
  }

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

      <main className="mx-auto max-w-6xl px-6 py-12">
        {/* Blog header */}
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400">
          Show · The Case Room
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">
          The Case Room
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Real business cases where the mechanical work is done for you. Make the calls
          that actually matter, then see your judgment A/B-tested against an expert&apos;s.
        </p>

        {/* Grid (left) + filter panel (right on desktop, top on mobile) */}
        <div className="mt-8 flex flex-col-reverse gap-8 lg:flex-row">
          <div className="flex-1">
            <div className="mb-4 text-sm text-slate-500">
              {filtered.length} of {manifest.cases.length} case
              {manifest.cases.length === 1 ? "" : "s"}
            </div>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-slate-500">
                No cases match these filters.
                <button
                  onClick={() => setSelected(EMPTY)}
                  className="mt-2 block w-full text-sky-400 hover:text-sky-300"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filtered.map((stub) => (
                  <CaseCard key={stub.id} stub={stub} progress={progress[stub.id]} />
                ))}
              </div>
            )}
          </div>

          <aside className="lg:w-64 lg:shrink-0 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <SlidersHorizontal size={14} className="text-slate-500" />
                  Filter
                </span>
                {activeCount > 0 && (
                  <button
                    onClick={() => setSelected(EMPTY)}
                    className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300"
                  >
                    <X size={11} />
                    Clear ({activeCount})
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {FACET_KEYS.map((key) => (
                  <div key={key}>
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {FACET_LABELS[key]}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {facetOptions[key].map(({ value, count }) => {
                        const on = selected[key].includes(value);
                        return (
                          <button
                            key={value}
                            onClick={() => toggle(key, value)}
                            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                              on
                                ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                            }`}
                          >
                            {value}
                            <span className={on ? "text-sky-400/70" : "text-slate-600"}> {count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
