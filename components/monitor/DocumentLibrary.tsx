"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { liveDocuments, versionOutcomes, DOC_KIND_LABEL } from "@/lib/monitor/documents";
import type {
  DocumentKind, MonitorApplication, MonitorApplicationEvent,
  MonitorDocument, MonitorDocumentVersion,
} from "@/types/monitor";

// Your CVs and cover letters, measured against what happened to them.
//
// This is the payoff of making documents entities rather than text columns:
// "v3 — sent to 7, 2 interviews. v4 — sent to 11, 4 interviews." No AI, no
// inference; it falls straight out of the reference an application holds.
//
// Read-only on purpose. The Documents tab is where the library is managed;
// duplicating add, rename and archive here would give the same data two write
// paths and two places to check when one of them misbehaves. This is a readout
// beside the chart, because both answer the same question: is any of it working?

interface Props {
  documents:    MonitorDocument[];
  versions:     MonitorDocumentVersion[];
  applications: MonitorApplication[];
  events:       MonitorApplicationEvent[];
}

export default function DocumentLibrary({
  documents, versions, applications, events,
}: Props) {
  const [open, setOpen] = useState(true);

  const live     = liveDocuments(documents);
  const archived = documents.filter(d => d.archived_at !== null);

  if (documents.length === 0) {
    return (
      <div className="mt-4 border-t border-slate-800 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Documents
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Add a résumé in the Documents tab, attach it to an application, and this
          becomes a record of which version actually got interviews.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 transition-colors hover:text-slate-400"
      >
        <ChevronRight size={13} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        Documents ({live.length})
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-3">
          {live.map(d => (
            <DocumentCard
              key={d.id} document={d} versions={versions}
              applications={applications} events={events}
            />
          ))}

          {archived.length > 0 && (
            <p className="text-[10px] text-slate-700">
              {archived.length} archived — restore them in the Documents tab.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  document, versions, applications, events,
}: {
  document:     MonitorDocument;
  versions:     MonitorDocumentVersion[];
  applications: MonitorApplication[];
  events:       MonitorApplicationEvent[];
}) {
  const outcomes = versionOutcomes(
    document.id, versions, applications, events, document.kind as DocumentKind,
  );

  return (
    <div className="group rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-300">
          {document.label}
        </span>
        <span className="shrink-0 text-[10px] text-slate-700">
          {DOC_KIND_LABEL[document.kind]}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {outcomes.map(o => (
          <div key={o.version.id} className="flex items-baseline gap-2 text-[11px]">
            <span className="w-6 shrink-0 tabular-nums text-slate-500">v{o.version.version}</span>
            {o.sent === 0 ? (
              // Stated rather than hidden: a version sent nowhere is a fact, and
              // omitting the row would make a new version look like a failed one.
              <span className="text-slate-700">not sent yet</span>
            ) : (
              <span className="min-w-0 flex-1 text-slate-500">
                sent to <span className="tabular-nums text-slate-300">{o.sent}</span>
                {" · "}
                <span className="tabular-nums text-slate-300">{o.interviews}</span> interview{o.interviews === 1 ? "" : "s"}
                {o.sent > 0 && <span className="text-slate-700"> ({o.interviewRate}%)</span>}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* The note on the newest version, if it has one — usually the reason it
          exists, which is what makes two versions comparable at all. */}
      {outcomes[0]?.version.note && (
        <p className="mt-1.5 truncate text-[10px] italic text-slate-600">
          v{outcomes[0].version.version}: {outcomes[0].version.note}
        </p>
      )}
    </div>
  );
}
