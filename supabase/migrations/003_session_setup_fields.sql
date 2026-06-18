-- ============================================================
-- Hugh Interview Coach — Session Setup Fields
-- Migration: 003_session_setup_fields.sql
-- ============================================================

-- Widen the room check constraint to include 'custom'.
-- The inline CHECK created in 001 is auto-named 'sessions_room_check' by Postgres.
-- IF EXISTS makes this safe to re-run.
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_room_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_room_check
  CHECK (room IN ('data_engineering', 'data_science', 'ml_engineering', 'custom'));

-- Add session setup fields
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS topic           TEXT,
  ADD COLUMN IF NOT EXISTS job_description TEXT,
  ADD COLUMN IF NOT EXISTS skip_intro      BOOLEAN NOT NULL DEFAULT false;
