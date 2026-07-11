// ── Mastery result: validation + defensive parsing (pure, unit-tested) ──────
// One place that (a) validates the evaluator model's raw output before it is
// ever persisted, and (b) reads the stored mastery_feedback field back safely —
// supporting historical PLAIN-TEXT records and malformed JSON without breaking.

import type { MasteryResultV1, MasteryStatus } from "@/types";

const VALID_STATUSES: ReadonlySet<string> = new Set<MasteryStatus>([
  "mastered",
  "developing",
  "not_yet",
]);

function deriveStatus(score: number): MasteryStatus {
  if (score >= 7) return "mastered";
  if (score >= 4) return "developing";
  return "not_yet";
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, 5); // keep the stored payload concise
}

// Coerce an arbitrary parsed object into a valid MasteryResultV1, or null if it
// is too malformed to trust (missing/NaN score). Never throws.
export function coerceMasteryResult(parsed: unknown): MasteryResultV1 | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;

  const rawScore = o.masteryScore;
  if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) return null;
  const masteryScore = Math.max(1, Math.min(10, Math.round(rawScore)));

  const masteryStatus =
    typeof o.masteryStatus === "string" && VALID_STATUSES.has(o.masteryStatus)
      ? (o.masteryStatus as MasteryStatus)
      : deriveStatus(masteryScore);

  return {
    version:                      1,
    masteryStatus,
    masteryScore,
    strengths:                    toStringArray(o.strengths),
    misconceptions:               toStringArray(o.misconceptions),
    missingConcepts:              toStringArray(o.missingConcepts),
    recommendedReview:            toStringArray(o.recommendedReview),
    suggestedNextStep:            typeof o.suggestedNextStep === "string" ? o.suggestedNextStep.trim() : "",
    supportingTranscriptEvidence: toStringArray(o.supportingTranscriptEvidence),
  };
}

// Parse the evaluator model's RAW text output. Strips markdown fences, parses,
// validates. Returns null on anything unusable so the route can reject rather
// than persist garbage.
export function parseMasteryResult(raw: string): MasteryResultV1 | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  return coerceMasteryResult(parsed);
}

// What the stored mastery_feedback turned out to be.
export type ParsedStoredFeedback =
  | { kind: "structured"; result: MasteryResultV1 }
  | { kind: "text"; text: string }
  | { kind: "empty" };

// Defensively read the stored mastery_feedback field. Historical records are
// plain text; new records are versioned JSON. Anything that isn't valid
// structured JSON is surfaced as text so nothing ever breaks.
export function parseStoredMasteryFeedback(raw: string | null | undefined): ParsedStoredFeedback {
  if (!raw || !raw.trim()) return { kind: "empty" };

  const trimmed = raw.trim();
  // Only attempt JSON if it looks like an object — avoids mangling plain prose.
  if (trimmed.startsWith("{")) {
    try {
      const result = coerceMasteryResult(JSON.parse(trimmed));
      if (result) return { kind: "structured", result };
    } catch {
      /* fall through to text */
    }
  }
  return { kind: "text", text: trimmed };
}
