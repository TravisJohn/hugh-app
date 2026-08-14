import type { CoveredPoint, TranscriptMessage } from "@/types";

/**
 * Validation for the two records a learning session leaves behind: what it
 * established (`covered`) and the conversation itself (`transcript`).
 *
 * Both cross a trust boundary twice — once as model output, once as a request
 * body from the browser — so neither is ever stored as it arrives. Anything
 * malformed is dropped rather than rejected: a session that produced a slightly
 * odd record should still save its summary, just with less attached to it.
 */

export const MAX_COVERED_POINTS   = 12;
export const MAX_POINT_CHARS      = 160;
export const MAX_DETAIL_CHARS     = 800;

export const MAX_TRANSCRIPT_MESSAGES = 200;
export const MAX_MESSAGE_CHARS       = 8_000;

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Keeps only well-formed points, capped in count and length. Returns null when
 * nothing survives, so callers store SQL NULL and quiz generation falls back to
 * the narrative body rather than treating an empty list as "nothing covered".
 */
export function sanitizeCovered(value: unknown): CoveredPoint[] | null {
  if (!Array.isArray(value)) return null;

  const points: CoveredPoint[] = [];
  for (const item of value) {
    if (points.length >= MAX_COVERED_POINTS) break;
    if (typeof item !== "object" || item === null) continue;

    const record = item as Record<string, unknown>;
    const point  = cleanString(record.point,  MAX_POINT_CHARS);
    const detail = cleanString(record.detail, MAX_DETAIL_CHARS);

    // A point without its substance is exactly the failure this record exists
    // to prevent — a topic label with nothing behind it.
    if (!point || !detail) continue;
    points.push({ point, detail });
  }

  return points.length > 0 ? points : null;
}

/** Keeps only user/assistant turns with content, capped in count and length. */
export function sanitizeTranscript(value: unknown): TranscriptMessage[] | null {
  if (!Array.isArray(value)) return null;

  const messages: TranscriptMessage[] = [];
  for (const item of value) {
    if (messages.length >= MAX_TRANSCRIPT_MESSAGES) break;
    if (typeof item !== "object" || item === null) continue;

    const record  = item as Record<string, unknown>;
    const role    = record.role;
    const content = cleanString(record.content, MAX_MESSAGE_CHARS);

    if (role !== "user" && role !== "assistant") continue;
    if (!content) continue;
    messages.push({ role, content });
  }

  return messages.length > 0 ? messages : null;
}
