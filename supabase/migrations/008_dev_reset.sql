-- ============================================================
-- Hugh — Developer Reset Utility
-- Migration: 008_dev_reset.sql
--
-- ⚠️  WARNING: This file is for LOCAL / STAGING testing only.
--     NEVER run this against your production database.
--     All deletes are irreversible.
--
-- HOW TO USE:
--   Open Supabase Dashboard → SQL Editor, copy the block you
--   need, and run it. Do NOT run the entire file top-to-bottom
--   unless you intend to do a full wipe.
-- ============================================================


-- ── Option A: Delete one specific user by email ───────────────────────────
--
-- Removes the user from auth.users plus ALL their linked data
-- (sessions, answers, questions, profiles, learning_goals, tracks, etc.)
-- because every table has ON DELETE CASCADE on the user_id foreign key.
--
-- Replace the email address before running.

/*
DELETE FROM auth.users
WHERE email = 'your@email.com';
*/


-- ── Option B: Wipe ALL users (full blank slate) ───────────────────────────
--
-- Deletes every account and all associated data.
-- Use this when you want the app to feel completely fresh,
-- as if nobody has ever signed up.

/*
DELETE FROM auth.users;
*/


-- ── Option C: Wipe app data only — keep your login ───────────────────────
--
-- The most useful option for day-to-day testing.
-- Clears all sessions, goals, tracks, and profiles for your account
-- so you can re-test the full onboarding flow without having to
-- sign up again.
--
-- A fresh 'free' plan profile is re-inserted so the quota check
-- works correctly on the next session.
--
-- Replace the email address before running.

/*
DELETE FROM sessions
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com');

DELETE FROM learning_goals
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com');

DELETE FROM tracks
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com');

DELETE FROM profiles
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com');

INSERT INTO profiles (user_id)
  SELECT id FROM auth.users WHERE email = 'your@email.com'
  ON CONFLICT (user_id) DO NOTHING;
*/
