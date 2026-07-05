"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, X, SlidersHorizontal, Search, ChevronDown } from "lucide-react";
import {
  FACET_KEYS,
  FACET_LABELS,
  type CaseProgress,
  type CaseStub,
  type FacetKey,
  type Manifest,
} from "@/types/cases";
import CaseCard from "./CaseCard";

/** A case's values for one facet. Single facets are wrapped to an array; an
 *  absent facet (e.g. `stack` on an analytics case) yields an empty list. */
function valuesOf(stub: CaseStub, key: FacetKey): string[] {
  const v = stub.facets[key];
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

type Selected = Record<FacetKey, string[]>;
const EMPTY: Selected = { about: [], industry: [], modelling: [], statistics: [], stack: [] };

/**
 * The Case Room library — a blog-style index with a right-hand facet filter.
 *
 * Filter model (client-side over the manifest; tens of cases → trivial):
 *  - Each facet is a COLLAPSED category pill (About / Industry / Modelling use /
 *    Statistics / Cloud stack). Pressing a category reveals its value pills.
 *    Selecting values is OR within a facet, AND across facets.
 *  - An always-present text box filters cases immediately by title / company /
 *    domain / any facet value — AND-combined with whatever pills are selected.
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<FacetKey, boolean>>({
    about: false,
    industry: false,
    modelling: false,
    statistics: false,
    stack: false,
  });

  // Distinct values + counts per facet, most common first. Facets with no values
  // at all (e.g. `stack` before any DE cases exist) are dropped from the panel.
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return manifest.cases.filter((stub) => {
      const facetOk = FACET_KEYS.every((key) => {
        const sel = selected[key];
        return sel.length === 0 || valuesOf(stub, key).some((v) => sel.includes(v));
      });
      if (!facetOk) return false;
      if (!q) return true;
      const haystack = [
        stub.title,
        stub.company,
        stub.domain,
        ...FACET_KEYS.flatMap((k) => valuesOf(stub, k)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [manifest, selected, query]);

  const activeCount = FACET_KEYS.reduce((n, k) => n + selected[k].length, 0);
  const isFiltering = activeCount > 0 || query.trim().length > 0;

  function toggle(key: FacetKey, value: string) {
    setSelected((s) => {
      const has = s[key].includes(value);
      return { ...s, [key]: has ? s[key].filter((v) => v !== value) : [...s[key], value] };
    });
  }

  function clearAll() {
    setSelected(EMPTY);
    setQuery("");
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
                  onClick={clearAll}
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
                {isFiltering && (
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300"
                  >
                    <X size={11} />
                    Clear{activeCount > 0 ? ` (${activeCount})` : ""}
                  </button>
                )}
              </div>

              {/* Ever-present text box — filters the case list immediately. */}
              <div className="relative mb-4">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cases…"
                  aria-label="Search cases"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/60 py-1.5 pl-8 pr-8 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Category pills — press to reveal that facet's value pills. */}
              <div className="space-y-1.5">
                {FACET_KEYS.map((key) => {
                  const options = facetOptions[key];
                  if (options.length === 0) return null; // no cases carry this facet
                  const activeInKey = selected[key].length;
                  const isOpen = open[key];
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                        aria-expanded={isOpen}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors ${
                          activeInKey > 0
                            ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                            : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {FACET_LABELS[key]}
                          {activeInKey > 0 && (
                            <span className="rounded-full bg-sky-500/20 px-1.5 text-[10px] text-sky-200">
                              {activeInKey}
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          size={13}
                          className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {isOpen && (
                        <div className="flex flex-wrap gap-1.5 px-0.5 pb-1 pt-2">
                          {options.map(({ value, count }) => {
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
                                <span className={on ? "text-sky-400/70" : "text-slate-600"}>
                                  {" "}
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
