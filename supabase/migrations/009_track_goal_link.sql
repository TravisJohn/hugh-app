-- Link tracks to the learning_goals that spawned them.
-- goal_id is nullable so manually-created tracks (from TrackerDashboard) still work.
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES learning_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tracks_goal_id_idx ON tracks(goal_id);
