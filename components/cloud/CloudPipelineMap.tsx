"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  PROVIDERS,
  PROVIDER_LABELS,
  STAGES,
  STAGE_META,
  type CloudManifest,
  type CloudProvider,
  type ServiceStub,
  type Stage,
} from "@/types/cloud";

const PROVIDER_ACCENT: Record<CloudProvider, { text: string; chip: string }> = {
  aws: { text: "text-amber-300", chip: "border-amber-500/30 bg-amber-500/10 hover:border-amber-400/60 hover:bg-amber-500/20" },
  gcp: { text: "text-sky-300", chip: "border-sky-500/30 bg-sky-500/10 hover:border-sky-400/60 hover:bg-sky-500/20" },
  azure: { text: "text-blue-300", chip: "border-blue-500/30 bg-blue-500/10 hover:border-blue-400/60 hover:bg-blue-500/20" },
};

/**
 * The holistic "Pipeline map" view: every service laid out by the stage it
 * plays in an end-to-end data pipeline (Ingest → Store → Process → Orchestrate →
 * Serve → Govern), with a column per cloud. It's a read-at-a-glance architecture
 * picture — pick one cloud to see just that provider's full toolchain, or All to
 * compare the three side by side. All data comes from the manifest stubs.
 */
export default function CloudPipelineMap({
  manifest,
  provider,
}: {
  manifest: CloudManifest;
  provider: CloudProvider | "all";
}) {
  const columns = provider === "all" ? PROVIDERS : [provider];

  // stage → provider → services in that stage. Precomputed once.
  const byStage = useMemo(() => {
    const out = {} as Record<Stage, Record<CloudProvider, ServiceStub[]>>;
    for (const s of STAGES) {
      out[s] = { aws: [], gcp: [], azure: [] };
    }
    for (const stub of manifest.services) {
      for (const st of stub.stages) {
        out[st][stub.provider].push(stub);
      }
    }
    // Stable name sort within each cell.
    for (const s of STAGES)
      for (const p of PROVIDERS)
        out[s][p].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [manifest]);

  return (
    <div className="space-y-3">
      {STAGES.map((stage, i) => (
        <div
          key={stage}
          className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row">
            {/* Stage label rail */}
            <div className="lg:w-44 lg:shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-400">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-200">
                  {STAGE_META[stage].label}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 lg:pl-8">
                {STAGE_META[stage].blurb}
              </p>
            </div>

            {/* Provider columns */}
            <div
              className={`grid flex-1 gap-3 ${
                columns.length === 1 ? "grid-cols-1" : "sm:grid-cols-3"
              }`}
            >
              {columns.map((p) => (
                <div key={p} className="min-w-0">
                  {columns.length > 1 && (
                    <div className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${PROVIDER_ACCENT[p].text}`}>
                      {PROVIDER_LABELS[p]}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {byStage[stage][p].length === 0 ? (
                      <span className="text-xs text-slate-600">—</span>
                    ) : (
                      byStage[stage][p].map((stub) => (
                        <Link
                          key={stub.id}
                          href={`/cloud/${stub.provider}/${stub.id}`}
                          title={stub.oneLiner}
                          className={`rounded-lg border px-2.5 py-1 text-xs text-slate-200 transition-colors ${PROVIDER_ACCENT[p].chip}`}
                        >
                          {stub.name}
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
