-- ── Tracker: tracks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title              TEXT        NOT NULL,
  topic_description  TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'paused', 'completed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracks_owner" ON tracks
  FOR ALL USING (auth.uid() = user_id);

-- ── Tracker: milestones ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id   UUID        NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  summary    TEXT        NOT NULL,
  kanban_column  TEXT    NOT NULL DEFAULT 'backlog'
                         CHECK (kanban_column IN ('backlog', 'learn', 'review', 'done')),
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_owner" ON milestones
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tracks
      WHERE tracks.id = milestones.track_id
        AND tracks.user_id = auth.uid()
    )
  );

-- ── Tracker: milestone_entries (diary) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestone_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id  UUID        NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE milestone_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entries_owner" ON milestone_entries
  FOR ALL USING (auth.uid() = user_id);
