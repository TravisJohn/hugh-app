// ── The margin — pure rules ─────────────────────────────────────────────────
// Everything the pad and the review list need that isn't React or Supabase:
// what counts as an empty note, how a section stub is appended, what a card
// shows, and how search narrows the list.
//
// Pure: no React, no network. The API layer applies the same normalisation the
// UI does, so a note typed in the pad and a note posted by hand can never
// disagree about what was stored.

import type { MarginNote } from "@/types/margin";

/**
 * The most one margin note may hold. Generous on purpose — this replaces a
 * physical notebook page, and being told to stop writing is exactly the moment
 * a learner goes back to paper. Long enough that nobody will meet it by
 * writing; short enough that a runaway paste can't fill a column.
 */
export const MARGIN_BODY_MAX = 20_000;

/**
 * Coerce and cap, and nothing else.
 *
 * Deliberately does NOT trim. A stub ends in a trailing space ("**Gotchas** — ")
 * because the cursor sits after it, and a save that quietly ate that space would
 * fight the learner every time the page reloaded. Emptiness is a separate
 * question — see `isBlank`.
 */
export function normaliseBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.slice(0, MARGIN_BODY_MAX);
}

/**
 * Whether a body is worth keeping a row for.
 *
 * Whitespace-only counts as blank, which is what makes "clear the pad" a
 * deletion rather than an empty card in the review list. Opening a service,
 * thinking about it, and typing nothing should leave no trace.
 */
export function isBlank(body: string): boolean {
  return body.trim().length === 0;
}

/** The stub a section heading becomes: written, not a placeholder to overwrite. */
export function stubFor(heading: string): string {
  return `**${heading}** — `;
}

/**
 * Whether this section has already been pulled into the note.
 *
 * Matched on the rendered stub rather than the bare heading, so a note that
 * merely mentions the word "Gotchas" in a sentence doesn't block the button.
 */
export function hasStub(body: string, heading: string): boolean {
  return body.includes(stubFor(heading));
}

/**
 * Append a section heading to the note, ready to be written under.
 *
 * The whole point of the button: facing a blank box after reading two thousand
 * words is when a learner closes it, and facing "**Gotchas** — " is when they
 * write. Appending an existing stub a second time would produce a note with two
 * half-filled Gotchas sections, so a repeat click returns the body untouched
 * and the caller simply focuses the pad.
 */
export function appendStub(body: string, heading: string): string {
  if (hasStub(body, heading)) return body;
  const stub = stubFor(heading);
  if (isBlank(body)) return stub;
  // Exactly one blank line between entries, however the previous one ended —
  // otherwise a pad edited over several sittings drifts into ragged spacing.
  return `${body.replace(/\s+$/, "")}\n\n${stub}`;
}

/**
 * A single line for a review card. Markdown emphasis is stripped rather than
 * rendered, because a preview is a label: bold text inside a card subtitle
 * reads as a heading and makes every card look like it starts a new section.
 */
export function preview(body: string, max = 160): string {
  const flat = body
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}

/** Most recently written first — a margin is read newest-first, like a diary. */
export function sortNotes(notes: readonly MarginNote[]): MarginNote[] {
  return notes.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/**
 * Narrow the review list by free text, matching the thing annotated *and* what
 * was written about it. Searching only titles would make the list a worse index
 * than the catalog it sits beside; the reason to search your own notes is to
 * find the sentence, not the service.
 */
export function filterNotes(notes: readonly MarginNote[], query: string): MarginNote[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes.slice();
  return notes.filter(
    n => n.ref_label.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
  );
}

/** Ids, labels and hrefs are all short identifiers, not prose. */
export const MARGIN_REF_MAX = 200;

export interface MarginRef {
  ref_id:    string;
  ref_label: string;
  ref_href:  string;
}

/**
 * Validate the three reference fields that ride along with every save.
 *
 * `ref_href` must be an in-app path. The review list renders it as a link, so
 * an absolute URL arriving here would let a crafted request plant an off-site
 * link inside the learner's own notes — the one place they have every reason to
 * trust. Protocol-relative ("//evil.example") is rejected for the same reason:
 * a browser treats it as absolute even though it starts with a slash.
 *
 * Returns null rather than throwing, so the route answers 400 and nothing
 * half-formed reaches the table.
 */
export function normaliseRef(raw: unknown): MarginRef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { ref_id, ref_label, ref_href } = raw as Record<string, unknown>;

  if (typeof ref_id !== "string" || typeof ref_label !== "string" || typeof ref_href !== "string") {
    return null;
  }

  const id    = ref_id.trim().slice(0, MARGIN_REF_MAX);
  const label = ref_label.trim().slice(0, MARGIN_REF_MAX);
  const href  = ref_href.trim().slice(0, MARGIN_REF_MAX);

  if (!id || !label) return null;
  if (!href.startsWith("/") || href.startsWith("//")) return null;

  return { ref_id: id, ref_label: label, ref_href: href };
}
