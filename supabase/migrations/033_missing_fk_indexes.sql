-- ── MEDIUM-06 fix (deployment readiness audit, 2026-08-04) ──────────────────
-- Postgres does not auto-index columns referencing a foreign key. These
-- tables (001_initial_schema.sql, 005_tracker.sql, 006_learning_goals.sql)
-- are queried by these columns directly and inside RLS subqueries
-- (questions_owner_policy, answers_owner_policy, milestones_owner), so every
-- row read/write currently does a sequential scan that gets worse as data
-- grows. Composite shapes below match how each table is actually queried,
-- not just the bare FK column.
--
-- Tables are small today, so a plain (non-CONCURRENT) CREATE INDEX is fine
-- here. If this is applied against a production table with meaningful rows
-- already in it, run these with CREATE INDEX CONCURRENTLY instead, one
-- statement per transaction (CONCURRENTLY can't run inside the implicit
-- migration transaction).

CREATE INDEX IF NOT EXISTS sessions_user_room_status_started_idx
  ON sessions (user_id, room, status, started_at DESC);

CREATE INDEX IF NOT EXISTS questions_session_order_idx
  ON questions (session_id, order_index);

CREATE INDEX IF NOT EXISTS answers_question_idx
  ON answers (question_id);

CREATE INDEX IF NOT EXISTS tracks_user_created_idx
  ON tracks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS milestones_track_column_position_idx
  ON milestones (track_id, kanban_column, position);

CREATE INDEX IF NOT EXISTS milestone_entries_milestone_created_idx
  ON milestone_entries (milestone_id, created_at);

CREATE INDEX IF NOT EXISTS learning_goals_user_created_idx
  ON learning_goals (user_id, created_at DESC);
