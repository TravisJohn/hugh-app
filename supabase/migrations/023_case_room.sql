-- ── The Case Room: case_attempts ───────────────────────────────────────────
-- One row per completed play of a strategic case. The cases themselves are
-- static content (served from files today, GCS/CDN later), so only the
-- learner's attempts live in the DB. Append-only history — the library rolls
-- these up per case (completed?, best muscles-held) for its badges.
--
--   choices    — decisionId -> chosen optionId
--   flags      — flagKey    -> 'strong' | 'weak'
--   held_count — how many of the three muscles held (0..3), denormalized so the
--                library badge doesn't have to re-derive it from flags.
CREATE TABLE IF NOT EXISTS case_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id      TEXT        NOT NULL,
  batch        TEXT,
  choices      JSONB       NOT NULL,
  flags        JSONB       NOT NULL,
  held_count   INTEGER     NOT NULL DEFAULT 0 CHECK (held_count BETWEEN 0 AND 3),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rollup query shape: a learner's attempts for the library badges.
CREATE INDEX IF NOT EXISTS case_attempts_user_case_idx
  ON case_attempts (user_id, case_id);

ALTER TABLE case_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_attempts_owner" ON case_attempts
  FOR ALL USING (auth.uid() = user_id);
