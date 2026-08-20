// ── Monitor Documents — versions, and how each one performed ───────────────
// A document is a thing you maintain; a version is a state of it; an
// application references the version it was sent. That reference is what makes
// `versionOutcomes` possible, and `versionOutcomes` is the reason the tables
// exist at all.
//
// Pure: no React, no Supabase, no clock of its own.

import type {
  DocumentKind,
  MonitorApplication,
  MonitorApplicationEvent,
  MonitorDocument,
  MonitorDocumentVersion,
} from "@/types/monitor";

/** A label is one line in a list. */
export const DOC_LABEL_MAX = 120;

/** Why this version exists — a sentence, not an essay. */
export const VERSION_NOTE_MAX = 300;

/**
 * 5 MB. A CV or cover letter above this is either scanned at absurd resolution
 * or is not a CV. Lower than the 10 MB Notes allows for screenshots, because
 * there is no legitimate large case here.
 */
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

/**
 * The formats worth accepting, mapped to the extension we store under.
 *
 * An allowlist, never a blocklist: anything not named here is refused. It is
 * keyed on the browser-reported MIME type, which is a hint rather than proof —
 * the stored extension comes from this table, so a mislabelled upload can never
 * dictate the object's name on disk.
 *
 * Shared with the client so the file picker offers the same set the route will
 * accept, rather than letting someone choose a file only to be refused.
 */
export const ALLOWED_DOC_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/rtf": "rtf",
  "application/vnd.oasis.opendocument.text": "odt",
};

/** For the file picker's `accept` attribute. */
export const DOC_ACCEPT = Object.keys(ALLOWED_DOC_MIME).join(",");

/** "PDF", "DOCX" — the chip on an attached file. */
export function fileTypeLabel(mime: string | null): string {
  return (mime && ALLOWED_DOC_MIME[mime] ? ALLOWED_DOC_MIME[mime] : "file").toUpperCase();
}

/** "211 KB" — sizes people read, not bytes. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * A usable document name derived from the uploaded file's name.
 *
 * Naming a résumé is the one required field in the composer, and requiring it
 * before anything can be saved is how a form ends up with a dead button and no
 * explanation. The filename is almost always what you would have typed anyway —
 * "cv-analytics-2026-06.pdf" is already the name of the thing.
 *
 * Returns "" when nothing usable can be salvaged, so the caller decides whether
 * to fall back or to ask.
 */
export function labelFromFileName(fileName: string): string {
  const base   = fileName.replace(/\.[^.]+$/, "");
  const spaced = base.replace(/[_-]+/g, " ");
  return normaliseLabel(spaced) ?? "";
}

/** Whether a version carries the actual artifact, not just a transcription. */
export function hasFile(version: MonitorDocumentVersion): boolean {
  return version.file_path !== null;
}

export const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  resume:       "Résumé",
  cover_letter: "Cover letter",
};

export function isDocumentKind(v: unknown): v is DocumentKind {
  return v === "resume" || v === "cover_letter";
}

export function normaliseLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const label = raw.trim().replace(/\s+/g, " ").slice(0, DOC_LABEL_MAX);
  return label.length > 0 ? label : null;
}

/**
 * Two documents differing only in case or spacing are the same document.
 *
 * Compared on a folded key for the same reason skills are: without it, "Senior
 * DE CV" and "senior de cv" become two libraries of one résumé, each holding
 * half the history — and `versionOutcomes` then reports "sent to 1" twice
 * instead of "sent to 2" once, which is the number the whole feature exists to
 * produce.
 */
export function documentKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** An existing live document of this kind with the same folded name, if any. */
export function findDuplicateDocument(
  documents: readonly MonitorDocument[],
  kind: DocumentKind,
  label: string,
): MonitorDocument | null {
  const key = documentKey(label);
  return documents.find(
    d => d.kind === kind && d.archived_at === null && documentKey(d.label) === key,
  ) ?? null;
}

/**
 * The next version number for a document — one past the highest that exists,
 * never `count + 1`.
 *
 * Counting rows would reuse a number after a deletion, so two different texts
 * could both have been "v3" and an application's claim about which one it sent
 * would become unfalsifiable.
 */
export function nextVersionNumber(versions: readonly MonitorDocumentVersion[]): number {
  return versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

/** A document's versions, newest first — the order you pick from. */
export function versionsFor(
  documentId: string,
  versions: readonly MonitorDocumentVersion[],
): MonitorDocumentVersion[] {
  return versions
    .filter(v => v.document_id === documentId)
    .sort((a, b) => b.version - a.version);
}

/**
 * Live documents of one kind, newest first. Archived ones are excluded from
 * picking but their versions stay resolvable, because applications still point
 * at them.
 */
export function liveDocuments(
  documents: readonly MonitorDocument[],
  kind?: DocumentKind,
): MonitorDocument[] {
  return documents
    .filter(d => d.archived_at === null && (kind === undefined || d.kind === kind))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ── The payoff ──────────────────────────────────────────────────────────────

export interface VersionOutcome {
  version: MonitorDocumentVersion;
  /** Applications sent with this version. */
  sent: number;
  /** Of those, how many ever reached interview or offer. */
  interviews: number;
  offers: number;
  rejected: number;
  /** interviews as a whole percent of sent; 0 when nothing was sent. */
  interviewRate: number;
}

/**
 * How each version of a document actually performed.
 *
 * This is the whole reason résumés became entities. It counts interviews from
 * the application HISTORY, not from current status, for the same reason the
 * Interviews tile does: a version that won an interview and was then rejected
 * still won the interview, and a number that forgets that would fall precisely
 * when you most want to trust it.
 *
 * A version with nothing sent yet reports zeroes rather than being omitted —
 * "v4, sent to nobody" is information, and dropping the row would make a new
 * version look like it had failed.
 */
export function versionOutcomes(
  documentId: string,
  versions: readonly MonitorDocumentVersion[],
  applications: readonly MonitorApplication[],
  events: readonly MonitorApplicationEvent[],
  kind: DocumentKind,
): VersionOutcome[] {
  const field = kind === "resume" ? "resume_version_id" : "cover_letter_version_id";

  const reached = new Set<string>();
  for (const e of events) {
    if (e.status === "interview" || e.status === "offer") reached.add(e.application_id);
  }

  return versionsFor(documentId, versions).map(version => {
    const sentWith = applications.filter(a => a[field] === version.id);

    const interviews = sentWith.filter(
      a => reached.has(a.id) || a.status === "interview" || a.status === "offer",
    ).length;

    return {
      version,
      sent:          sentWith.length,
      interviews,
      offers:        sentWith.filter(a => a.status === "offer").length,
      rejected:      sentWith.filter(a => a.status === "rejected").length,
      interviewRate: sentWith.length === 0 ? 0 : Math.round((interviews / sentWith.length) * 100),
    };
  });
}

/**
 * Which version an application was sent with, resolved for display.
 * Returns null when nothing was attached, or when the version has been deleted
 * — the reference is ON DELETE SET NULL, so a missing document leaves a gap in
 * the record rather than taking the application down with it.
 */
export function attachedVersion(
  application: MonitorApplication,
  kind: DocumentKind,
  versions: readonly MonitorDocumentVersion[],
): MonitorDocumentVersion | null {
  const id = kind === "resume"
    ? application.resume_version_id
    : application.cover_letter_version_id;
  if (!id) return null;
  return versions.find(v => v.id === id) ?? null;
}

/** "Analytics Engineer CV v3" — how a version is named anywhere it is referred to. */
export function versionName(
  version: MonitorDocumentVersion,
  documents: readonly MonitorDocument[],
): string {
  const doc = documents.find(d => d.id === version.document_id);
  return `${doc?.label ?? "Document"} v${version.version}`;
}

/**
 * A sensible label for a one-off cover letter, so writing one for a single
 * application does not first require inventing a filing system.
 */
export function defaultCoverLetterLabel(company: string): string {
  return normaliseLabel(`Cover letter — ${company}`) ?? "Cover letter";
}
