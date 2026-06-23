-- ── Diary entry fact-checking ──────────────────────────────────────────────
-- Every milestone_entry is auto-verified by Claude against the card's goal.
-- A wrong entry surfaces a lingering warning + suggested correction until the
-- learner fixes it (accept the fix, or rewrite it correctly). The gap_note is a
-- PERMANENT record of the misunderstanding, kept even after correction.

ALTER TABLE milestone_entries
  ADD COLUMN IF NOT EXISTS fact_status TEXT    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS correction  TEXT,
  ADD COLUMN IF NOT EXISTS gap_note    TEXT,
  ADD COLUMN IF NOT EXISTS corrected   BOOLEAN NOT NULL DEFAULT false;

-- fact_status: 'pending' (not yet checked) | 'correct' | 'incorrect'
ALTER TABLE milestone_entries
  DROP CONSTRAINT IF EXISTS milestone_entries_fact_status_check;
ALTER TABLE milestone_entries
  ADD CONSTRAINT milestone_entries_fact_status_check
  CHECK (fact_status IN ('pending', 'correct', 'incorrect'));
