import "server-only";

// Private Storage bucket holding résumé and cover-letter files. Objects are
// keyed `<user_id>/<document_id>/<uuid>.<ext>` so the storage policies (and this
// code) can scope by owner on the first path segment — the same scheme
// note-images uses.
//
// Only the things the browser must never learn live here. The size limit and
// the accepted formats are in lib/monitor/documents.ts instead, because the
// upload form has to enforce the same rules before it sends anything, and a
// `server-only` module cannot be imported by a client component.

export const MONITOR_DOCS_BUCKET = "monitor-documents";

/**
 * How long a signed download URL stays valid. Deliberately shorter than the
 * Notes image TTL: a screenshot is looked at across an hour of coaching, a CV is
 * opened once. A leaked link to your résumé should die quickly.
 */
export const SIGNED_URL_TTL = 5 * 60; // 5 minutes
