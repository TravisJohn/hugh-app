-- ============================================================
-- Hugh Interview Coach — Voice Mode
-- Migration: 004_voice_enabled.sql
-- ============================================================

-- Add voice_enabled flag to sessions.
-- Defaults to true so all existing sessions keep their current behaviour.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN NOT NULL DEFAULT true;
