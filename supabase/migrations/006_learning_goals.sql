-- ── Learning goals (dashboard wishlist) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_goals (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic      TEXT        NOT NULL,
  start_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  end_date   DATE        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE learning_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_owner" ON learning_goals
  FOR ALL USING (auth.uid() = user_id);
