-- ── 037: Monitor — Skills and Applications ─────────────────────────────────
--
-- Monitor (/monitor) is the first surface in Hugh that is purely a record
-- rather than a teacher. Nothing here is generated, scored, or sent to a model:
-- every row is text the learner typed. See docs/monitor-prd.md.
--
-- Three tables, two features:
--   • monitor_skills + monitor_skill_entries — a skill you want to learn, and
--     one row per day you actually touched it.
--   • monitor_applications — job applications, shaped like a /notes page.
--
-- The Usage view's `activity_events` table is deliberately NOT here. It is
-- migration 038, shipping with Phase C, because it is the only part that
-- requires instrumenting ten existing surfaces.

-- ── Skills ──────────────────────────────────────────────────────────────────
-- Free text, with no foreign key to learning_goals or milestones. That is the
-- design, not an omission: Monitor records what you did, not what Hugh
-- assigned, so it must be able to track something Hugh doesn't teach.
CREATE TABLE IF NOT EXISTS monitor_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Soft delete: a skill you stopped working on is history, not a mistake, and
  -- its heatmap stays meaningful. Nothing in Monitor hard-deletes a skill.
  archived_at TIMESTAMPTZ
);

-- The list query is always "this user's live skills, oldest first".
CREATE INDEX IF NOT EXISTS monitor_skills_user_idx
  ON monitor_skills (user_id, archived_at, created_at);

-- One row per session, NOT one row per day. There is deliberately no unique
-- constraint on (skill_id, entry_date): two sessions on window functions in one
-- day are two entries, and the heatmap ramp shades by count. A unique
-- constraint here would flatten five shades to on/off.
CREATE TABLE IF NOT EXISTS monitor_skill_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id   UUID NOT NULL REFERENCES monitor_skills(id) ON DELETE CASCADE,
  -- Denormalised from monitor_skills so the RLS policy reads one table rather
  -- than joining on every row check.
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS monitor_skill_entries_skill_idx
  ON monitor_skill_entries (skill_id, entry_date DESC);

-- ── Applications ────────────────────────────────────────────────────────────
-- Only the CURRENT status is stored, not a status history. The daily stacked
-- chart is "applications sent per day, coloured by where they stand now",
-- which is fully derivable from applied_on + status. A status-event table
-- would buy a funnel-over-time view nobody asked for, and stays purely
-- additive if that view is ever wanted.
--
-- The five statuses are fixed by a CHECK because they are not merely labels:
-- their colours are a validated palette whose stacking order is load-bearing
-- (see lib/monitor/applications.ts). A free-text status would produce
-- uncoloured bars.
CREATE TABLE IF NOT EXISTS monitor_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company         TEXT NOT NULL,
  role_title      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'applied'
                    CHECK (status IN ('applied','screening','interview','offer','rejected')),
  applied_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  job_description TEXT,
  cover_letter    TEXT,
  resume_text     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Both the list (newest first) and the daily chart read this ordering.
CREATE INDEX IF NOT EXISTS monitor_applications_user_idx
  ON monitor_applications (user_id, applied_on DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Owner-only on every table, matching 027_notes.sql. Monitor holds a learner's
-- diary lines and their job search; there is no shared or admin-readable path
-- to any of it by design.
ALTER TABLE monitor_skills         ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_skill_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_applications   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitor_skills_owner_all" ON monitor_skills
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "monitor_skill_entries_owner_all" ON monitor_skill_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "monitor_applications_owner_all" ON monitor_applications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
