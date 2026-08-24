// ── The privacy scrubbers ───────────────────────────────────────────────────
//
// Nothing a learner typed may reach `operation_events`. Not their topic, not
// their diary, not a prompt, not a model's echo of any of those.
//
// Truncation alone does not achieve that: a parse error can quote the model's
// output, and a Postgres error can quote the row values it rejected. So
// redaction is EXPLICIT — the caller passes the strings it knows came from the
// learner, because the caller is the only thing that reliably knows which
// those are. Pattern-matching for "things that look private" would be a guess,
// and a guess is not a guarantee.
//
// The 40-character ceiling on detail values is the second half of the
// guarantee: even if a caller forgets to pass a redaction string, free text
// cannot arrive through `detail`, because nothing long enough to be free text
// survives.
//
// Pure: no I/O, no dependencies.

/** Ceiling on a stored error note. Long enough to identify, short enough to be safe. */
export const MAX_ERROR_NOTE_CHARS = 200;

/** Ceiling on any string inside `detail`. The free-text guarantee. */
export const MAX_DETAIL_STRING_CHARS = 40;

/** Ceiling on how many keys `detail` may carry, so it cannot become a document. */
export const MAX_DETAIL_KEYS = 12;

/**
 * Redaction strings shorter than this are ignored.
 *
 * A one- or two-character needle shreds the message instead of protecting
 * anything — redacting the topic "R" would replace every letter R in the
 * error. Nothing that short is private, so the trade is free.
 */
export const MIN_REDACTABLE_CHARS = 3;

export const REDACTED = "[redacted]";

/** What `detail` is allowed to hold once scrubbed. */
export type DetailValue = string | number | boolean;
export type OperationDetail = Record<string, DetailValue>;

/**
 * Detail keys must look like identifiers. A key is as capable of carrying free
 * text as a value is, and this is cheaper than truncating both.
 */
const SAFE_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Newlines and runs of spaces collapse to one space, so a note stays one line. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Pull a message out of whatever was thrown. `throw` accepts any value, so
 * this must survive strings, plain objects, null, and things with no message
 * at all — never throwing on its way to reporting a throw.
 */
export function messageOf(err: unknown): string {
  if (err instanceof Error && typeof err.message === "string" && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err) return err;

  if (typeof err === "object" && err !== null) {
    const maybe = (err as { message?: unknown }).message;
    if (typeof maybe === "string" && maybe) return maybe;
  }

  if (typeof err === "number" || typeof err === "boolean") return String(err);

  return "Unknown error";
}

/** Cut to `max` characters exactly, marking that something was removed. */
export function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

/**
 * Replace every occurrence of each learner-supplied string.
 *
 * Case-insensitive, because an error may echo a topic in different casing than
 * the learner typed. Longest needle first, so when two overlap the more
 * specific one wins rather than being left half-standing by the shorter.
 */
export function redact(text: string, secrets: readonly string[]): string {
  const needles = Array.from(
    new Set(
      secrets
        .filter((s): s is string => typeof s === "string")
        .map(collapseWhitespace)
        .filter(s => s.length >= MIN_REDACTABLE_CHARS),
    ),
  ).sort((a, b) => b.length - a.length);

  let out = text;
  for (const needle of needles) {
    out = out.replace(new RegExp(escapeRegExp(needle), "gi"), REDACTED);
  }
  return out;
}

/**
 * Turn a thrown value into a note safe to store.
 *
 * Order matters: redact BEFORE truncating. Truncating first could cut a secret
 * in half and leave the front of it standing, which is exactly the leak this
 * function exists to prevent.
 *
 * @param err     whatever was thrown
 * @param secrets learner-supplied strings to remove — the topic, the milestone
 *                title, anything the learner typed that this call had in hand
 */
export function sanitize(err: unknown, secrets: readonly string[] = []): string {
  const message = collapseWhitespace(messageOf(err));
  return truncate(redact(message, secrets), MAX_ERROR_NOTE_CHARS);
}

/**
 * The error's class, for grouping in the panel. Never the stack — this is not
 * error monitoring, and a stack trace can quote source containing prompts.
 */
export function errorClassOf(err: unknown): string {
  if (err instanceof Error && err.name) return err.name;
  if (typeof err === "object" && err !== null) {
    const ctor = (err as { constructor?: { name?: unknown } }).constructor;
    if (ctor && typeof ctor.name === "string" && ctor.name !== "Object") return ctor.name;
  }
  return "UnknownError";
}

/**
 * Scrub a `detail` object down to bounded primitives.
 *
 * Every string is redacted and then cut to MAX_DETAIL_STRING_CHARS, which is
 * the runtime guarantee that free text cannot reach the database through this
 * field. Anything that is not a string, finite number, or boolean is dropped
 * outright — an array or nested object is a container for exactly the free
 * text this is meant to exclude.
 */
export function sanitizeDetail(
  detail:  Record<string, unknown>,
  secrets: readonly string[] = [],
): OperationDetail {
  const out: OperationDetail = {};
  let kept = 0;

  for (const [key, value] of Object.entries(detail)) {
    if (kept >= MAX_DETAIL_KEYS) break;
    if (!SAFE_KEY.test(key)) continue;

    if (typeof value === "string") {
      out[key] = truncate(redact(collapseWhitespace(value), secrets), MAX_DETAIL_STRING_CHARS);
      kept++;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
      kept++;
      continue;
    }
    if (typeof value === "boolean") {
      out[key] = value;
      kept++;
    }
    // Everything else — objects, arrays, null, undefined, NaN, Infinity,
    // functions, symbols — is dropped rather than coerced. Coercing would
    // invent a value that never existed and could carry free text with it.
  }

  return out;
}
