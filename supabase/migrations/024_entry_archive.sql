-- ── Diary entries: soft-archive ──────────────────────────────────────────
-- Lets a learner declutter a tracker card's learning diary without destroying
-- anything. NULL = active (shown by default); a timestamp = archived (hidden
-- behind a "Show archived" toggle, restorable). We never hard-delete entries.
ALTER TABLE milestone_entries
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Fast "active entries for this milestone" reads (the default diary view).
CREATE INDEX IF NOT EXISTS idx_milestone_entries_active
  ON milestone_entries (milestone_id)
  WHERE archived_at IS NULL;
