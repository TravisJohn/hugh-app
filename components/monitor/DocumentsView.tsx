"use client";

import { useState } from "react";
import {
  Plus, Loader2, FileText, Download, Eye, EyeOff, Archive, ArchiveRestore,
  Pencil, Check, Inbox,
} from "lucide-react";
import {
  liveDocuments, versionOutcomes, hasFile, fileTypeLabel, formatBytes,
  DOC_KIND_LABEL, type VersionOutcome,
} from "@/lib/monitor/documents";
import VersionComposer from "./VersionComposer";
import type { MonitorApplicationsState, MonitorDocumentsState } from "@/hooks/useMonitor";
import type { DocumentKind, MonitorDocument } from "@/types/monitor";

// Résumés and Cover Letters — the repository, standing on its own.
//
// It has its own tab because that is what a repository is: the CVs exist
// whether or not you applied anywhere today, and reaching them should not
// require inventing an application first. It sits BEFORE Applications in the
// tab bar because that is the order you do things in — an attachment depends on
// a document existing, and the tab order says so without a word of instruction.
//
// Two panes, each scrolling internally. The page does not scroll.

const KINDS: readonly DocumentKind[] = ["resume", "cover_letter"] as const;

export default function DocumentsView({ docs, apps }: {
  docs: MonitorDocumentsState;
  apps: MonitorApplicationsState;
}) {
  const [adding, setAdding] = useState<DocumentKind | null>(null);

  if (docs.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-600">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const selected = docs.selected;
  const nothingYet = liveDocuments(docs.documents).length === 0;

  return (
    <div className="flex min-h-0 flex-1 gap-4 p-4">

      {/* ── Left: the library ───────────────────────────────────────── */}
      <section className="flex min-h-0 w-[280px] shrink-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/30">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {KINDS.map(kind => {
            const mine = liveDocuments(docs.documents, kind);
            return (
              <div key={kind} className="mb-4 last:mb-0">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {DOC_KIND_LABEL[kind]}s
                </p>

                {mine.length > 0 && (
                  <div className="mb-1.5 flex flex-col gap-1">
                    {mine.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => docs.select(d.id)}
                        aria-current={selected?.id === d.id ? "true" : undefined}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                          selected?.id === d.id
                            ? "bg-cyan-950/30 text-cyan-200"
                            : "text-slate-400 hover:bg-slate-800/50"
                        }`}
                      >
                        <FileText size={11} className="shrink-0 opacity-60" />
                        <span className="min-w-0 flex-1 truncate text-[11px]">{d.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* The primary action of this tab, sized like one. It used to
                    be a 12px icon beside the heading, which meant the only way
                    to add a CV was invisible. */}
                <button
                  type="button"
                  onClick={() => setAdding(adding === kind ? null : kind)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-2 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:border-cyan-700 hover:bg-cyan-950/20 hover:text-cyan-300"
                >
                  <Plus size={12} /> Add {DOC_KIND_LABEL[kind].toLowerCase()}
                </button>
              </div>
            );
          })}

          <ArchivedDocs docs={docs} />
        </div>
      </section>

      {/* ── Right: one document, its versions, and how they did ─────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/30">
        {adding ? (
          <div className="overflow-y-auto p-4">
            <VersionComposer
              kind={adding}
              existing={null}
              busy={docs.busy}
              onCancel={() => setAdding(null)}
              onSave={async (label, body) => {
                const version = await docs.createDocument(adding, label, body);
                if (version) docs.select(version.document_id);
                setAdding(null);
              }}
            />
          </div>
        ) : selected ? (
          <DocumentDetail docs={docs} apps={apps} document={selected} />
        ) : (
          <EmptyLibrary nothingYet={nothingYet} onAdd={() => setAdding("resume")} />
        )}
      </section>
    </div>
  );
}

/** With an empty library, the form is the point — so offer it, don't describe it. */
function EmptyLibrary({ nothingYet, onAdd }: { nothingYet: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <Inbox size={28} className="mx-auto mb-3 text-slate-700" />
        <p className="text-sm leading-relaxed text-slate-500">
          {nothingYet
            ? "Your résumés and cover letters live here. Upload one and every application can record which version it was sent — so you can see which of them actually got interviews."
            : "Pick a document on the left to see its versions and how each one performed."}
        </p>
        {nothingYet && (
          <button
            type="button"
            onClick={onAdd}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
          >
            <Plus size={13} /> Add your first résumé
          </button>
        )}
      </div>
    </div>
  );
}

function DocumentDetail({ docs, apps, document }: {
  docs:     MonitorDocumentsState;
  apps:     MonitorApplicationsState;
  document: MonitorDocument;
}) {
  const [addingVersion, setAdding] = useState(false);
  const [renaming, setRenaming]    = useState(false);
  const [draftLabel, setDraft]     = useState(document.label);

  const outcomes = versionOutcomes(
    document.id, docs.versions, apps.applications, apps.events, document.kind,
  );

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-4 py-3">
        {renaming ? (
          <>
            <input
              value={draftLabel}
              onChange={e => setDraft(e.target.value)}
              maxLength={120}
              autoFocus
              className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-sm text-slate-200 outline-none focus:border-cyan-600"
            />
            <button
              type="button"
              disabled={docs.busy || draftLabel.trim().length === 0}
              onClick={async () => { await docs.rename(document.id, draftLabel.trim()); setRenaming(false); }}
              aria-label="Save the new name"
              className="shrink-0 rounded p-1 text-cyan-400 hover:bg-slate-800 disabled:opacity-40"
            >
              <Check size={14} />
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-slate-100">{document.label}</h2>
              <p className="text-xs text-slate-600">{DOC_KIND_LABEL[document.kind]}</p>
            </div>
            <button
              type="button"
              onClick={() => { setDraft(document.label); setRenaming(true); }}
              aria-label="Rename this document"
              title="Rename"
              className="shrink-0 rounded p-1 text-slate-600 hover:text-slate-300"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              disabled={docs.busy}
              onClick={() => void docs.setArchived(document.id, true)}
              aria-label="Archive this document"
              title="Archive — it moves to Archived at the foot of the list, and applications keep pointing at its versions"
              className="shrink-0 rounded p-1 text-slate-600 hover:text-slate-300 disabled:cursor-not-allowed"
            >
              <Archive size={13} />
            </button>
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {addingVersion ? (
          <div className="mb-4">
            <VersionComposer
              kind={document.kind}
              existing={document}
              busy={docs.busy}
              onCancel={() => setAdding(false)}
              onSave={async (_label, body) => {
                await docs.addVersion(document.id, body);
                setAdding(false);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            disabled={docs.busy}
            onClick={() => setAdding(true)}
            className="mb-4 flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed"
          >
            <Plus size={13} /> New version
          </button>
        )}

        <div className="flex flex-col gap-2">
          {outcomes.map(o => <VersionRow key={o.version.id} outcome={o} />)}
        </div>
      </div>
    </>
  );
}

/**
 * One version: what it is, what happened to it, and a look at it without
 * leaving the page.
 *
 * Hovering reveals the actions and a peek at what is inside. It does NOT fetch
 * the file — a signed URL is minted per request and lives five minutes, and
 * spending one every time the cursor crosses a row would put live links to a
 * résumé into the page by accident. Looking properly is one click, and it opens
 * in place rather than in another tab.
 */
function VersionRow({ outcome }: { outcome: VersionOutcome }) {
  const { version, sent, interviews, interviewRate, offers, rejected } = outcome;
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);

  async function signedUrl(download: boolean): Promise<string | null> {
    const res = await fetch(
      `/api/monitor/documents/file?version=${version.id}${download ? "&download=1" : ""}`,
    );
    const data = await res.json() as { url?: string };
    return data.url ?? null;
  }

  async function toggleView() {
    if (preview) { setPreview(null); return; }
    setBusy(true);
    try {
      setPreview(await signedUrl(false));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    try {
      const url = await signedUrl(true);
      // A plain navigation: the URL already carries Content-Disposition, so the
      // browser saves it under its original name instead of rendering it.
      if (url) window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group rounded-xl border border-slate-800 bg-slate-950/40 p-3 transition-colors hover:border-slate-700">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-200">
          v{version.version}
        </span>
        {version.file_name && (
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">{version.file_name}</span>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-slate-700">
          {new Date(version.created_at).toLocaleDateString(undefined, {
            day: "numeric", month: "short", year: "numeric",
          })}
        </span>
      </div>

      {version.note && (
        <p className="mt-1 text-[11px] italic text-slate-500">{version.note}</p>
      )}

      {/* The point of the whole thing: what this version actually did. */}
      <p className="mt-2 text-[11px] text-slate-500">
        {sent === 0
          ? <span className="text-slate-700">Not sent yet</span>
          : <>
              Sent to <span className="tabular-nums text-slate-300">{sent}</span>
              {" · "}
              <span className="tabular-nums text-slate-300">{interviews}</span> interview{interviews === 1 ? "" : "s"}
              <span className="text-slate-700"> ({interviewRate}%)</span>
              {offers   > 0 && <> · <span className="tabular-nums text-emerald-400">{offers}</span> offer{offers === 1 ? "" : "s"}</>}
              {rejected > 0 && <span className="text-slate-700"> · {rejected} rejected</span>}
            </>}
      </p>

      {/* Actions appear on hover, and are always reachable by keyboard through
          focus-within — a control that only exists under a cursor is a control
          some people do not have. */}
      <div className="mt-2 flex items-center gap-2 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {hasFile(version) ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleView()}
              className="flex items-center gap-1.5 rounded bg-slate-800/70 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {preview ? <EyeOff size={10} /> : <Eye size={10} />}
              {busy && !preview ? "Opening…" : preview ? "Hide" : "Look at it"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void download()}
              className="flex items-center gap-1.5 rounded bg-slate-800/70 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              <Download size={10} /> Download
            </button>
            <span className="text-[10px] text-slate-700">
              {fileTypeLabel(version.mime)} · {formatBytes(version.file_size)}
            </span>
          </>
        ) : (
          <span className="text-[10px] text-slate-700">Text only — no file kept</span>
        )}
        {version.content && (
          <span className="ml-auto text-[10px] text-slate-700">
            {version.content.length.toLocaleString()} characters of text
          </span>
        )}
      </div>

      {/* In place, not in another tab: checking which version this is should not
          cost you the page you were on. */}
      {preview && (
        <iframe
          src={preview}
          title={`${version.file_name ?? "Document"} preview`}
          className="mt-2 h-[420px] w-full rounded-lg border border-slate-800 bg-slate-950"
        />
      )}

      {/* Text-only versions have nothing to embed, but they do have the words. */}
      {!hasFile(version) && version.content && (
        <pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-950/60 p-2.5 text-[10px] leading-relaxed text-slate-400">
          {version.content}
        </pre>
      )}
    </div>
  );
}

/**
 * Where archived documents went.
 *
 * Always labelled once anything has been archived, and it says what archiving
 * did rather than only listing the casualties: the versions are still attached
 * to the applications that were sent them, which is the whole reason archiving
 * exists instead of deletion.
 */
function ArchivedDocs({ docs }: { docs: MonitorDocumentsState }) {
  const [open, setOpen] = useState(false);
  const archived = docs.documents.filter(d => d.archived_at !== null);
  if (archived.length === 0) return null;

  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 transition-colors hover:text-slate-400"
      >
        <Archive size={11} />
        Archived ({archived.length})
      </button>

      {open && (
        <>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-700">
            Put away, not deleted. Applications you sent these to still point at
            the exact version they got.
          </p>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {archived.map(d => (
              <div key={d.id} className="group/arch flex items-center gap-2 py-0.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{d.label}</span>
                <button
                  type="button"
                  disabled={docs.busy}
                  onClick={() => void docs.setArchived(d.id, false)}
                  aria-label={`Restore ${d.label}`}
                  title="Put this back in the library"
                  className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] text-slate-600 transition-colors hover:bg-slate-800 hover:text-cyan-400 disabled:cursor-not-allowed"
                >
                  <ArchiveRestore size={10} /> Restore
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
