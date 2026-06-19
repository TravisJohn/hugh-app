-- ── User access controls ──────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approved       BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_blocked     BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage_reset_at TIMESTAMPTZ           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS token_limit    INTEGER               DEFAULT NULL;

-- Approve the platform owner (safe to re-run)
UPDATE profiles
SET approved = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'tjmariohn@gmail.com');

-- ── Usage logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  feature    TEXT        NOT NULL,
  tokens_in  INTEGER     NOT NULL DEFAULT 0,
  tokens_out INTEGER     NOT NULL DEFAULT 0,
  tts_chars  INTEGER     NOT NULL DEFAULT 0
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own logs; service-role key writes (bypasses RLS)
CREATE POLICY "usage_logs_select_own"
  ON usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Index for fast per-user monthly queries
CREATE INDEX IF NOT EXISTS usage_logs_user_created
  ON usage_logs (user_id, created_at DESC);
