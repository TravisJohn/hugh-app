"use client";

import { useState } from "react";
import { Trash2, Check, Paperclip, ExternalLink } from "lucide-react";
import {
  STATUS_STACK, STATUS_COLOR, STATUS_LABEL, APP_DOC_MAX,
} from "@/lib/monitor/applications";
import StatusPill from "./StatusPill";
import { attachedVersion, versionName, hasFile } from "@/lib/monitor/documents";
import { urlHost } from "@/lib/monitor/applications";
import type {
  ApplicationStatus, MonitorApplication, MonitorApplicationEvent,
  MonitorDocument, MonitorDocumentVersion,
} from "@/types/monitor";

// The right pane: the documents you actually sent, and the history of what
// happened to them.
//
// Four document tabs rather than four stacked boxes — a job description and a
// cover letter are each a page long, and side by side they would leave neither
// readable. The pane scrolls internally; the page does not.

// Two kinds of tab, because there are two kinds of thing here.
//
// A job description and your notes belong to this application alone — free text
// on the row. A résumé and a cover letter are things you SEND, often more than
// once, so they are references to a version of a maintained document. That
// distinction is the whole of migration 040.
const TEXT_TABS = [
  { key: "job_description", label: "Job description", placeholder: "Paste the posting — six weeks from now you'll want to know what they actually asked for." },
  { key: "notes",           label: "Notes",           placeholder: "Anything else — the referral, the recruiter's name, the salary band." },
] as const;

type TextKey = typeof TEXT_TABS[number]["key"];

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

interface Props {
  application: MonitorApplication;
  history:     MonitorApplicationEvent[];
  documents:   MonitorDocument[];
  versions:    MonitorDocumentVersion[];
  busy:        boolean;
  onSaveField: (field: TextKey, value: string) => Promise<void>;
  onSetStatus: (status: ApplicationStatus, note: string) => Promise<void>;
  /** Opens the attach pane — the fourth pane, hidden until wanted. */
  onOpenAttach: () => void;
  attachOpen:   boolean;
  onDelete:     () => Promise<void>;
}

export default function ApplicationDetail({
  application, history, documents, versions, busy,
  onSaveField, onSetStatus, onOpenAttach, attachOpen, onDelete,
}: Props) {
  const [tab, setTab]         = useState<TextKey>("job_description");
  const [statusNote, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-800 px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-slate-100">{application.role_title}</h2>
            <p className="truncate text-xs text-slate-500">
              {application.company} · applied {shortDate(application.applied_on)}
            </p>
            {application.job_url && (
              // noreferrer as well as noopener: the destination is a job board,
              // and it has no business knowing which page sent you. The URL was
              // validated to http/https on the way in, so this cannot be a
              // script scheme.
              <a
                href={application.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-cyan-500 hover:text-cyan-300"
              >
                <ExternalLink size={10} className="shrink-0" />
                <span className="truncate">{urlHost(application.job_url)}</span>
              </a>
            )}
          </div>
          <StatusPill status={application.status} />
          <button
            type="button"
            disabled={busy}
            onClick={() => confirming ? void onDelete() : setConfirming(true)}
            title={confirming ? "Click again to remove permanently" : "Remove this application"}
            aria-label="Remove this application"
            className={`shrink-0 rounded p-1 transition-colors disabled:cursor-not-allowed ${
              confirming ? "bg-red-950/60 text-red-400" : "text-slate-700 hover:text-red-400"
            }`}
          >
            <Trash2 size={14} />
          </button>
        </div>
        {confirming && (
          <p className="mt-1.5 text-[11px] text-red-400">
            Click the bin again to remove this permanently — its history goes with it.
          </p>
        )}
      </div>

      {/* ── Move it along ───────────────────────────────────────────── */}
      {/* Every status is always offered, including going backwards. A search
          does not run in one direction — a "rejected" typed in error has to be
          undoable, and a role can reopen. */}
      <div className="shrink-0 border-b border-slate-800 px-4 py-2.5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Move it along
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_STACK.map(s => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => { void onSetStatus(s, statusNote); setNote(""); }}
              className="rounded-full border px-2 py-0.5 text-[11px] transition-opacity hover:opacity-100 disabled:cursor-not-allowed"
              style={{
                color:       STATUS_COLOR[s],
                borderColor: `${STATUS_COLOR[s]}59`,
                background:  `${STATUS_COLOR[s]}14`,
                opacity:     application.status === s ? 1 : 0.6,
              }}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <input
          value={statusNote}
          onChange={e => setNote(e.target.value)}
          placeholder="What happened? (optional — kept on the timeline)"
          maxLength={300}
          className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-300 outline-none placeholder:text-slate-700 focus:border-cyan-700"
        />
      </div>

      {/* ── Documents ───────────────────────────────────────────────── */}
      {/* What was sent, always visible in one line — so you never have to open
          a pane to find out whether anything is attached. Clicking it opens the
          pane that changes it. */}
      <AttachmentSummary
        application={application}
        documents={documents}
        versions={versions}
        open={attachOpen}
        onOpen={onOpenAttach}
      />

      {/* The dot marks a tab with something in it. */}
      <div className="flex shrink-0 gap-1 border-b border-slate-800 px-4 py-2">
        {TEXT_TABS.map(t => (
          <TabButton
            key={t.key} label={t.label} active={tab === t.key}
            filled={!!application[t.key]} onClick={() => setTab(t.key)}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* Keyed by tab: switching tabs remounts the editor with the new text
            rather than syncing it in an effect, so this box can never briefly
            show one document's contents under another one's heading. */}
        <DocEditor
          key={tab}
          tab={tab}
          initial={application[tab] ?? ""}
          busy={busy}
          onSave={value => onSaveField(tab, value)}
        />

        {/* ── History ───────────────────────────────────────────────── */}
        <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Status history
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-slate-600">Nothing recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {history.map(e => (
              <div key={e.id} className="flex gap-2 text-xs">
                <span className="w-12 shrink-0 tabular-nums text-slate-600">
                  {shortDate(e.occurred_on)}
                </span>
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: STATUS_COLOR[e.status] }}
                />
                <span className="min-w-0 flex-1 text-slate-400">
                  <span className="text-slate-300">{STATUS_LABEL[e.status]}</span>
                  {e.note && <span className="text-slate-500"> — {e.note}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One document field, edited and saved explicitly.
 *
 * Saving is a button rather than an autosave: these are long pasted documents,
 * and a debounce that fired mid-paste would store half a cover letter and call
 * it the record. The button only appears once something has actually changed.
 */
function DocEditor({ tab, initial, busy, onSave }: {
  tab:     TextKey;
  initial: string;
  busy:    boolean;
  onSave:  (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const meta = TEXT_TABS.find(t => t.key === tab);
  const dirty = draft !== initial;

  return (
    <>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        maxLength={APP_DOC_MAX}
        placeholder={meta?.placeholder}
        className="h-56 w-full resize-y rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs leading-relaxed text-slate-300 outline-none placeholder:text-slate-700 focus:border-cyan-700"
      />
      {dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave(draft)}
          className="mt-2 flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check size={13} /> Save {meta?.label.toLowerCase()}
        </button>
      )}
    </>
  );
}

/** One tab. The dot says "there is something in here" without opening it. */
function TabButton({ label, active, filled, onClick }: {
  label: string; active: boolean; filled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-slate-800 text-slate-200" : "text-slate-600 hover:bg-slate-800/50 hover:text-slate-400"
      }`}
    >
      {label}
      {filled && <span className="ml-1 text-cyan-500">·</span>}
    </button>
  );
}

/**
 * One line saying what this application was sent with.
 *
 * Always visible, even though the pane that edits it is not. The commonest
 * question about an attachment is "is there one?", and answering that should
 * never cost a click — only changing it should.
 */
function AttachmentSummary({ application, documents, versions, open, onOpen }: {
  application: MonitorApplication;
  documents:   MonitorDocument[];
  versions:    MonitorDocumentVersion[];
  open:        boolean;
  onOpen:      () => void;
}) {
  const cv     = attachedVersion(application, "resume", versions);
  const letter = attachedVersion(application, "cover_letter", versions);

  const parts: string[] = [];
  if (cv)     parts.push(versionName(cv, documents));
  if (letter) parts.push(versionName(letter, documents));

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      className={`flex shrink-0 items-center gap-2 border-b border-slate-800 px-4 py-2 text-left transition-colors ${
        open ? "bg-slate-800/40" : "hover:bg-slate-800/30"
      }`}
    >
      <Paperclip size={12} className={parts.length > 0 ? "text-cyan-400" : "text-slate-700"} />
      <span className={`min-w-0 flex-1 truncate text-[11px] ${parts.length > 0 ? "text-slate-400" : "text-slate-600"}`}>
        {parts.length > 0 ? parts.join("  ·  ") : "Nothing attached"}
        {(cv && hasFile(cv)) || (letter && hasFile(letter))
          ? <span className="text-slate-600"> · file</span>
          : null}
      </span>
      <span className="shrink-0 text-[10px] text-slate-600">{open ? "close" : "attach"}</span>
    </button>
  );
}
