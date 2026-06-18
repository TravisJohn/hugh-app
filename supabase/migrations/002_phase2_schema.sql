-- ============================================================
-- Hugh Interview Coach — Phase 2 Schema
-- Migration: 002_phase2_schema.sql
-- ============================================================

-- Add coaching_mode to sessions (active = immediate feedback, passive = end-of-session summary)
ALTER TABLE sessions
  ADD COLUMN coaching_mode TEXT NOT NULL DEFAULT 'active'
    CHECK (coaching_mode IN ('active', 'passive'));

-- Add hint to questions (nullable — populated on demand, cached to avoid repeat API calls)
ALTER TABLE questions
  ADD COLUMN hint TEXT;
