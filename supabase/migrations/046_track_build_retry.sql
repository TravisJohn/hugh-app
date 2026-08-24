-- ── Track build: when did this attempt start? ────────────────────────────
--
-- Stall detection previously measured from learning_goals.created_at, which
-- is only correct for a goal's *first* build. A retry sets track_status back
-- to 'pending' without changing created_at, so every retried goal would read
-- as stalled the instant it started. This column records when the current
-- build attempt began, and is rewritten on each retry.
--
-- Backfilled from created_at so existing goals keep the behaviour they have
-- today; new rows default to NOW().

ALTER TABLE learning_goals
  ADD COLUMN IF NOT EXISTS track_started_at TIMESTAMPTZ;

UPDATE learning_goals
   SET track_started_at = created_at
 WHERE track_started_at IS NULL;

ALTER TABLE learning_goals
  ALTER COLUMN track_started_at SET DEFAULT NOW();
