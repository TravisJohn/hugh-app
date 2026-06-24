-- Track-generation status for a learning goal.
-- The goal row is created immediately; the Kanban track is built afterwards
-- in a background task (Next.js `after()`). The frontend watches this column
-- over Supabase Realtime to know when the track is ready (or has failed).
--
--   pending → track generation has been scheduled / is in progress
--   ready   → track + milestones exist and are usable
--   failed  → generation errored; the goal still exists, but has no track
--
-- Existing rows default to 'ready' (they were created before this column and
-- already have their tracks). New inserts from the goals route set 'pending'.
ALTER TABLE learning_goals
  ADD COLUMN IF NOT EXISTS track_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (track_status IN ('pending', 'ready', 'failed'));

-- Realtime needs the full previous row image to deliver UPDATE payloads
-- reliably to filtered subscriptions.
ALTER TABLE learning_goals REPLICA IDENTITY FULL;

-- Add the table to the Realtime publication (idempotent — guarded so the
-- migration can be re-run without error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_publication_tables
    WHERE  pubname   = 'supabase_realtime'
    AND    schemaname = 'public'
    AND    tablename = 'learning_goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE learning_goals;
  END IF;
END $$;
