-- ── 038: effort on a skill entry ───────────────────────────────────────────
--
-- A session is not just a session: half an hour of skimming and two hours of
-- fighting a problem are both one tick, and a record that cannot tell them
-- apart overstates the light days. Each entry now carries how hard it was, on
-- a 1-5 scale where 5 is intensive and 1 is subpar.
--
-- This changes what a Monitor heatmap cell means: it now shades by the day's
-- PEAK effort rather than by how many sessions it held. The grid answers "how
-- hard did I go" instead of "how often did I show up". Both are honest; the
-- first is the one worth half a year of screen space.
--
-- NULLABLE on purpose. Entries written before this migration were bare ticks
-- with no effort recorded, and there is no way to know retrospectively how hard
-- they were. Rather than backfill a number nobody entered, NULL keeps meaning
-- "not recorded" and lib/monitor/skills.ts reads it as effort 1 for shading —
-- the same weight as the lightest thing the learner could have said. That
-- under-states old ticks rather than inventing effort for them.
--
-- The CHECK is what stops the scale drifting: the UI has exactly five steps and
-- the ramp has exactly five shades, so a 6 or a 0 would have nowhere to render.

ALTER TABLE monitor_skill_entries
  ADD COLUMN IF NOT EXISTS effort SMALLINT
    CHECK (effort IS NULL OR effort BETWEEN 1 AND 5);

COMMENT ON COLUMN monitor_skill_entries.effort IS
  'How intensive this session was, 1 (subpar) to 5 (intensive). NULL for bare ticks and for rows written before migration 038; read as 1 when shading.';
