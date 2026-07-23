-- ── Notes: red/yellow/green flag per screenshot ──────────────────────────────
-- A quick manual signal the learner can stamp on a screenshot (e.g. red = still
-- shaky on this, green = solid) — purely a label, no scoring logic reads it.
ALTER TABLE note_images
  ADD COLUMN IF NOT EXISTS flag TEXT CHECK (flag IN ('red', 'yellow', 'green'));
