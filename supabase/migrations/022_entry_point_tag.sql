-- ── Diary entries: optional learning-point tag ───────────────────────────
-- Links a diary entry / saved Ask summary to one of its milestone's
-- "What to understand" learning points. Soft reference: learning points live
-- in the milestones.learning_points JSONB array, so this holds that point's
-- string id rather than a hard FK. NULL = untagged (a general entry).
ALTER TABLE milestone_entries
  ADD COLUMN IF NOT EXISTS point_id TEXT;

-- Fast lookup of "entries tagged to this point" when rendering counts/filters.
CREATE INDEX IF NOT EXISTS milestone_entries_point_idx
  ON milestone_entries (milestone_id, point_id);
