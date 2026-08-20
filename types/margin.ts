// ── The margin — shared types ───────────────────────────────────────────────
// One plain-text note per learner per thing-being-read. See migration 045 for
// why the key is generic and why the row snapshots its own display fields.
//
// This is NOT the /notes workspace (types/index.ts). That one is screenshot-
// first with a vision Coach; this one is a textarea that saves.

/**
 * The surfaces that can carry a margin. One today, and the union is the point:
 * adding a surface is a TypeScript change, not a migration, but an unknown
 * string still can't reach the API.
 */
export const MARGIN_SURFACES = ["cloud"] as const;

export type MarginSurface = (typeof MARGIN_SURFACES)[number];

export function isMarginSurface(v: unknown): v is MarginSurface {
  return typeof v === "string" && (MARGIN_SURFACES as readonly string[]).includes(v);
}

export interface MarginNote {
  id:      string;
  user_id: string;
  surface: MarginSurface;
  /** The thing annotated, scoped to the surface — e.g. "aws/s3". */
  ref_id:  string;
  /** Display snapshots, rewritten on every save so a rename self-heals. */
  ref_label: string;
  ref_href:  string;
  body:      string;
  created_at: string;
  updated_at: string;
}

/** What the pad sends when it saves. The snapshots ride along with the body. */
export interface MarginNoteWrite {
  surface:   MarginSurface;
  ref_id:    string;
  ref_label: string;
  ref_href:  string;
  body:      string;
}
