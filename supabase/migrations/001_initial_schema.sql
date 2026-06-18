-- ============================================================
-- Hugh Interview Coach — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- ── sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room           TEXT        NOT NULL CHECK (room IN ('data_engineering', 'data_science', 'ml_engineering')),
  persona_id     TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  question_count INTEGER     NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ
);

-- ── questions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_text TEXT        NOT NULL,
  best_answer   TEXT        NOT NULL,
  question_type TEXT        NOT NULL CHECK (question_type IN ('intro', 'domain')),
  order_index   INTEGER     NOT NULL,
  asked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── answers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS answers (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id        UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  transcript         TEXT        NOT NULL,
  viewed_best_answer BOOLEAN     NOT NULL DEFAULT FALSE,
  used_best_answer   BOOLEAN     NOT NULL DEFAULT FALSE,
  feedback_text      TEXT,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers   ENABLE ROW LEVEL SECURITY;

-- sessions: users can only access their own rows
CREATE POLICY "sessions_owner_policy" ON sessions
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- questions: access is scoped through session ownership
CREATE POLICY "questions_owner_policy" ON questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id      = questions.session_id
        AND sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id      = questions.session_id
        AND sessions.user_id = auth.uid()
    )
  );

-- answers: access is scoped through question → session ownership
CREATE POLICY "answers_owner_policy" ON answers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM questions
      JOIN sessions ON sessions.id = questions.session_id
      WHERE questions.id     = answers.question_id
        AND sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM questions
      JOIN sessions ON sessions.id = questions.session_id
      WHERE questions.id     = answers.question_id
        AND sessions.user_id = auth.uid()
    )
  );
