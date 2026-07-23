-- ── Code drill attempts: per-cell practice history ───────────────────────────
-- One row per cell check (pass or fail), append-only — mirrors case_attempts,
-- not an upsert, so the full history survives for both uses:
--   1. Per-pack proficiency badges on /code/start (latest pass per cell, and
--      whether the reference was showing when it passed — "owned" vs "helped").
--   2. A calendar heatmap of practice activity (count of attempts per day).
--
-- used_ref mirrors DrillMock's in-memory `usedRef`/`helped` flag: true if the
-- reference/hint was visible when this attempt resolved. A cell whose most
-- recent PASS has used_ref = false was produced from memory — "owned".
--
-- The /api/code/attempts route inserts via the normal RLS-bound client
-- (auth.uid() = user_id), same idiom as case_attempts — this is private
-- per-learner data, not a shared cache (unlike code_drills).
CREATE TABLE IF NOT EXISTS code_drill_attempts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id     TEXT        NOT NULL,
  cell_id     TEXT        NOT NULL,
  passed      BOOLEAN     NOT NULL,
  used_ref    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two read shapes: "this user's attempts for this pack" (badges) and
-- "this user's attempts over time" (heatmap) — one index covers both well
-- enough at this data volume (a learner's full history is a few hundred rows).
CREATE INDEX IF NOT EXISTS code_drill_attempts_user_pack_idx
  ON code_drill_attempts (user_id, pack_id, created_at);

ALTER TABLE code_drill_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "code_drill_attempts_owner" ON code_drill_attempts
  FOR ALL USING (auth.uid() = user_id);
