"use client";

import { useState } from "react";
import { X, Download, Paperclip, Plus, ExternalLink } from "lucide-react";
import {
  liveDocuments, versionsFor, attachedVersion, hasFile,
  fileTypeLabel, formatBytes, defaultCoverLetterLabel, DOC_KIND_LABEL,
} from "@/lib/monitor/documents";
import VersionComposer from "./VersionComposer";
import type { VersionBody } from "@/hooks/useMonitor";
import type {
  DocumentKind, MonitorApplication, MonitorDocument, MonitorDocumentVersion,
} from "@/types/monitor";

// The attach pane — the fourth pane, opened on demand.
//
// Attaching is SELECTION, not creation. The library is the Documents tab; this
// picks from it. An earlier version led with a "New résumé" button and hid the
// existing versions as small chips beneath, which made the wrong action the
// obvious one: attaching the same CV to a second application produced a second
// document, and one résumé's record split across two libraries reporting
// "sent to 1" twice instead of "sent to 2" once.
//
// So the dropdown is the whole control. Adding a new one is still possible —
// a bespoke cover letter is a real thing — but it is a link, not the headline,
// and the server folds a repeated name into a new version of what you already
// have rather than a twin.

const KINDS: readonly DocumentKind[] = ["resume", "cover_letter"] as const;

interface Props {
  application: MonitorApplication;
  documents:   MonitorDocument[];
  versions:    MonitorDocumentVersion[];
  busy:        boolean;
  onClose:     () => void;
  onOpenLibrary: () => void;
  onAttach:    (kind: DocumentKind, versionId: string | null) => Promise<void>;
  onCreateDocument: (kind: DocumentKind, label: string, body: VersionBody) => Promise<MonitorDocumentVersion | null>;
}

export default function AttachPane({
  application, documents, versions, busy,
  onClose, onOpenLibrary, onAttach, onCreateDocument,
}: Props) {
  return (
    <section className="flex min-h-0 w-[300px] shrink-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/30">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <Paperclip size={13} className="text-cyan-400" />
        <h2 className="text-sm font-semibold text-slate-300">What you sent</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the attachments pane"
          className="ml-auto rounded p-1 text-slate-600 transition-colors hover:text-slate-300"
        >
          <X size={14} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {KINDS.map(kind => (
          <KindSection
            key={kind}
            kind={kind}
            application={application}
            documents={documents}
            versions={versions}
            busy={busy}
            onAttach={versionId => onAttach(kind, versionId)}
            onCreateDocument={(label, body) => onCreateDocument(kind, label, body)}
          />
        ))}

        <button
          type="button"
          onClick={onOpenLibrary}
          className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600 transition-colors hover:text-cyan-400"
        >
          <ExternalLink size={11} /> Manage the library in Documents
        </button>
      </div>
    </section>
  );
}

function KindSection({
  kind, application, documents, versions, busy, onAttach, onCreateDocument,
}: {
  kind:        DocumentKind;
  application: MonitorApplication;
  documents:   MonitorDocument[];
  versions:    MonitorDocumentVersion[];
  busy:        boolean;
  onAttach:    (versionId: string | null) => Promise<void>;
  onCreateDocument: (label: string, body: VersionBody) => Promise<MonitorDocumentVersion | null>;
}) {
  const [composing, setComposing] = useState(false);
  const attached = attachedVersion(application, kind, versions);
  const mine = liveDocuments(documents, kind);
  const empty = mine.length === 0;

  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {DOC_KIND_LABEL[kind]}
      </p>

      {/* One control: everything in the library, grouped by document. Picking
          is the whole interaction, which is why it is a select rather than a
          scatter of buttons that can be missed. */}
      <select
        value={attached?.id ?? ""}
        disabled={busy || empty}
        onChange={e => void onAttach(e.target.value || null)}
        aria-label={`${DOC_KIND_LABEL[kind]} sent with this application`}
        className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-600 disabled:opacity-50"
      >
        <option value="">
          {empty ? `No ${DOC_KIND_LABEL[kind].toLowerCase()} in the library yet` : "— nothing attached —"}
        </option>
        {mine.map(d => (
          <optgroup key={d.id} label={d.label}>
            {versionsFor(d.id, versions).map(v => (
              <option key={v.id} value={v.id}>
                v{v.version}
                {v.file_name ? ` · ${v.file_name}` : " · text only"}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {attached && (
        <AttachedCard version={attached} busy={busy} onDetach={() => onAttach(null)} />
      )}

      {composing ? (
        <VersionComposer
          kind={kind}
          existing={null}
          defaultLabel={kind === "cover_letter" ? defaultCoverLetterLabel(application.company) : ""}
          busy={busy}
          onCancel={() => setComposing(false)}
          onSave={async (label, body) => {
            const version = await onCreateDocument(label, body);
            // Filed and attached in one gesture: what you just added is by
            // definition what this application was sent.
            if (version) await onAttach(version.id);
            setComposing(false);
          }}
        />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setComposing(true)}
          className="flex items-center gap-1 text-[11px] text-slate-600 transition-colors hover:text-cyan-400 disabled:cursor-not-allowed"
        >
          <Plus size={11} /> Add a new one to the library
        </button>
      )}
    </div>
  );
}

/** What is attached, with a way to open the actual file and a way to detach. */
function AttachedCard({ version, busy, onDetach }: {
  version:  MonitorDocumentVersion;
  busy:     boolean;
  onDetach: () => Promise<void>;
}) {
  const [opening, setOpening] = useState(false);

  // Minted per click and dead in five minutes, so a page left open overnight
  // never holds a live link to a résumé.
  async function open() {
    setOpening(true);
    try {
      const res = await fetch(`/api/monitor/documents/file?version=${version.id}`);
      const data = await res.json() as { url?: string };
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="mb-2 rounded-lg border border-cyan-800/50 bg-cyan-950/20 p-2">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-cyan-200">
          v{version.version}
          {version.file_name && <span className="text-cyan-400/70"> · {version.file_name}</span>}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDetach()}
          title="Detach — the document itself is kept"
          aria-label="Detach this version"
          className="shrink-0 rounded p-0.5 text-slate-600 hover:text-slate-300 disabled:cursor-not-allowed"
        >
          <X size={11} />
        </button>
      </div>

      {hasFile(version) && (
        <button
          type="button"
          disabled={opening}
          onClick={() => void open()}
          className="mt-1.5 flex items-center gap-1.5 rounded bg-slate-800/70 px-1.5 py-1 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          <Download size={10} />
          {opening ? "Opening…" : `Open ${fileTypeLabel(version.mime)}`}
          <span className="text-slate-600">{formatBytes(version.file_size)}</span>
        </button>
      )}

      {version.note && (
        <p className="mt-1 text-[10px] italic text-slate-500">{version.note}</p>
      )}
    </div>
  );
}
