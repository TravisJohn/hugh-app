"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, X, Search, LayoutGrid, Network } from "lucide-react";
import {
  GROUP_LABELS,
  LOGICAL_GROUPS,
  PROVIDERS,
  PROVIDER_LABELS,
  type CloudManifest,
  type CloudProvider,
  type LogicalGroup,
  type ServiceStub,
} from "@/types/cloud";
import CloudPipelineMap from "./CloudPipelineMap";

// Per-provider accent, so the whole screen recolours when you switch clouds.
const PROVIDER_ACCENT: Record<
  CloudProvider,
  { text: string; border: string; bg: string; ring: string; dot: string }
> = {
  aws: {
    text: "text-amber-300",
    border: "border-amber-500/50",
    bg: "bg-amber-500/10",
    ring: "focus:ring-amber-500/30 focus:border-amber-500/50",
    dot: "bg-amber-400",
  },
  gcp: {
    text: "text-sky-300",
    border: "border-sky-500/50",
    bg: "bg-sky-500/10",
    ring: "focus:ring-sky-500/30 focus:border-sky-500/50",
    dot: "bg-sky-400",
  },
  azure: {
    text: "text-blue-300",
    border: "border-blue-500/50",
    bg: "bg-blue-500/10",
    ring: "focus:ring-blue-500/30 focus:border-blue-500/50",
    dot: "bg-blue-400",
  },
};

/**
 * The Cloud Skills library. Pick a cloud (tabs), then narrow by logical group
 * (pills) and/or a free-text search. All filtering is client-side over the
 * manifest — a few dozen services, so trivially fast. A normal scrolling
 * content page (this is a reference, not an interview screen).
 */
export default function CloudLanding({ manifest }: { manifest: CloudManifest }) {
  const [view, setView] = useState<"browse" | "map">("browse");
  const [provider, setProvider] = useState<CloudProvider>("aws");
  const [mapProvider, setMapProvider] = useState<CloudProvider | "all">("all");
  const [groups, setGroups] = useState<LogicalGroup[]>([]);
  const [query, setQuery] = useState("");

  const accent = PROVIDER_ACCENT[provider];

  // Services for the selected cloud only.
  const forProvider = useMemo(
    () => manifest.services.filter((s) => s.provider === provider),
    [manifest, provider],
  );

  // Which groups actually appear for this cloud (with counts), in canonical
  // order — drives the pill row.
  const groupOptions = useMemo(() => {
    const counts = new Map<LogicalGroup, number>();
    for (const s of forProvider)
      for (const g of s.groups) counts.set(g, (counts.get(g) ?? 0) + 1);
    return LOGICAL_GROUPS.filter((g) => counts.has(g)).map((g) => ({
      group: g,
      count: counts.get(g) ?? 0,
    }));
  }, [forProvider]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return forProvider.filter((s) => {
      const groupOk =
        groups.length === 0 || s.groups.some((g) => groups.includes(g));
      if (!groupOk) return false;
      if (!q) return true;
      const hay = [s.name, s.short ?? "", s.oneLiner, ...s.groups.map((g) => GROUP_LABELS[g])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [forProvider, groups, query]);

  const isFiltering = groups.length > 0 || query.trim().length > 0;

  function toggleGroup(g: LogicalGroup) {
    setGroups((cur) =>
      cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g],
    );
  }

  function pickProvider(p: CloudProvider) {
    setProvider(p);
    setGroups([]); // group set differs per cloud; reset to avoid empty results
    setQuery("");
  }

  function clearAll() {
    setGroups([]);
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

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-8">
        {/* Header */}
        <div className={`mb-2 text-xs font-semibold uppercase tracking-widest ${accent.text}`}>
          Cloud Skills
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Cloud Skills
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          The cloud services a data/analytics engineer actually needs — across AWS,
          Google Cloud and Azure. Browse by what a service does, or open the pipeline
          map to see the whole data-engineering toolchain end to end.
        </p>

        {/* View toggle: Browse ↔ Pipeline map */}
        <div className="mt-6 inline-flex rounded-xl border border-slate-800 bg-slate-900/60 p-1">
          <button
            onClick={() => setView("browse")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              view === "browse" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <LayoutGrid size={14} />
            Browse
          </button>
          <button
            onClick={() => setView("map")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              view === "map" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Network size={14} />
            Pipeline map
          </button>
        </div>

        {/* ── Pipeline map view ──────────────────────────────────────── */}
        {view === "map" && (
          <div className="mt-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">Show:</span>
              {(["all", ...PROVIDERS] as const).map((p) => {
                const on = mapProvider === p;
                return (
                  <button
                    key={p}
                    onClick={() => setMapProvider(p)}
                    className={`rounded-lg border px-3 py-1 text-sm font-medium transition-colors ${
                      on
                        ? "border-slate-600 bg-slate-800 text-slate-100"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    {p === "all" ? "All clouds" : PROVIDER_LABELS[p]}
                  </button>
                );
              })}
            </div>
            <CloudPipelineMap manifest={manifest} provider={mapProvider} />
          </div>
        )}

        {/* ── Browse view ────────────────────────────────────────────── */}
        {view === "browse" && (
        <>
        {/* Provider tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          {PROVIDERS.map((p) => {
            const on = p === provider;
            const a = PROVIDER_ACCENT[p];
            return (
              <button
                key={p}
                onClick={() => pickProvider(p)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  on
                    ? `${a.border} ${a.bg} ${a.text}`
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${on ? a.dot : "bg-slate-600"}`} />
                {PROVIDER_LABELS[p]}
              </button>
            );
          })}
        </div>

        {/* Group filter pills + search */}
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {groupOptions.map(({ group, count }) => {
              const on = groups.includes(group);
              return (
                <button
                  key={group}
                  onClick={() => toggleGroup(group)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    on
                      ? `${accent.border} ${accent.bg} ${accent.text}`
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                  }`}
                >
                  {GROUP_LABELS[group]}
                  <span className={on ? "opacity-70" : "text-slate-600"}> {count}</span>
                </button>
              );
            })}
          </div>

          <div className="relative shrink-0 lg:w-64">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services…"
              aria-label="Search services"
              className={`w-full rounded-lg border border-slate-800 bg-slate-900/60 py-1.5 pl-8 pr-8 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 ${accent.ring}`}
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
        </div>

        {/* Count + clear */}
        <div className="mt-6 mb-4 flex items-center gap-3 text-sm text-slate-500">
          <span>
            {filtered.length} of {forProvider.length} service
            {forProvider.length === 1 ? "" : "s"}
          </span>
          {isFiltering && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-slate-500 transition-colors hover:text-slate-300"
            >
              <X size={11} />
              Clear filters
            </button>
          )}
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-slate-500">
            No services match these filters.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((stub) => (
              <ServiceCard key={stub.id} stub={stub} accentText={accent.text} />
            ))}
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}

function ServiceCard({
  stub,
  accentText,
}: {
  stub: ServiceStub;
  accentText: string;
}) {
  return (
    <Link
      href={`/cloud/${stub.provider}/${stub.id}`}
      className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900/70"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-100">{stub.name}</h3>
      </div>
      {stub.short && (
        <p className="mt-0.5 text-xs text-slate-500">{stub.short}</p>
      )}
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
        {stub.oneLiner}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {stub.groups.map((g) => (
          <span
            key={g}
            className="rounded-md border border-slate-800 bg-slate-900/60 px-1.5 py-0.5 text-[11px] text-slate-500"
          >
            {GROUP_LABELS[g]}
          </span>
        ))}
      </div>
      <span className={`mt-3 text-xs font-semibold ${accentText}`}>
        Open →
      </span>
    </Link>
  );
}
