-- ── Self-assessment history: point_status_events ───────────────────────────
-- Append-only log of every change a learner makes to a learning point's
-- self-assessment status (understood / bookmarked / stuck / unstarted).
--
-- The `milestones.coverage` JSONB column still holds the *current* snapshot
-- (fast reads for the board/drawer/card). This table runs alongside it purely
-- as the historical record — it's the one thing we can't backfill later, so we
-- start capturing now. What we *do* with it (trends, recurring confusion,
-- time-to-understanding, nudges) is deliberately left for the future.
--
-- Each row is one transition for one point:
--   from_status / to_status — NULL means "unstarted" (no status set).
--   We only log actual changes (from_status <> to_status), enforced in the route.
CREATE TABLE IF NOT EXISTS point_status_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_id  UUID        NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  point_id      TEXT        NOT NULL,
  from_status   TEXT        CHECK (from_status IN ('understood', 'bookmarked', 'stuck')),
  to_status     TEXT        CHECK (to_status   IN ('understood', 'bookmarked', 'stuck')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Common future-query shapes: a learner's timeline, and a single point's history.
CREATE INDEX IF NOT EXISTS point_status_events_user_time_idx
  ON point_status_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS point_status_events_milestone_point_idx
  ON point_status_events (milestone_id, point_id);

ALTER TABLE point_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "point_status_events_owner" ON point_status_events
  FOR ALL USING (auth.uid() = user_id);
