-- ── Backlog priority mode ───────────────────────────────────────────────────
-- The Backlog column shows Hugh's build-time study order as fixed rank badges
-- (#1, #2, …) so a novice knows what to tackle next. This mode is per-track:
--   'auto'   → ranks follow the generated curriculum order (default, never changes)
--   'manual' → the learner reorders the backlog themselves
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS backlog_priority_mode TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE tracks
  DROP CONSTRAINT IF EXISTS tracks_backlog_priority_mode_check;
ALTER TABLE tracks
  ADD CONSTRAINT tracks_backlog_priority_mode_check
  CHECK (backlog_priority_mode IN ('auto', 'manual'));
