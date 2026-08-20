-- ── 039: application status history ────────────────────────────────────────
--
-- A status is a history, not a field. Migration 037 gave monitor_applications a
-- single mutable `status` column, which answers "where does this stand today"
-- and erases everything else: how long each stage took, how many applications
-- ever reached an interview, and at which stage they die. Six weeks into a job
-- search those are the only questions worth asking, and a mutable column cannot
-- answer any of them.
--
-- So every status change now appends a dated row here. The column stays as the
-- CURRENT status — it is what the list, the pills and the stacked chart read,
-- and it carries the CHECK that keeps the five statuses closed. Two places hold
-- status, which is a real risk, so they are written together from one pure
-- function (`statusChange` in lib/monitor/applications.ts) through one route.
-- Nothing else may write either.
--
-- `occurred_on` is a DATE, separate from `created_at`. You often record on
-- Thursday that the rejection landed on Tuesday, and the timeline should say
-- Tuesday. created_at stays as the audit of when you typed it.

CREATE TABLE IF NOT EXISTS monitor_application_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES monitor_applications(id) ON DELETE CASCADE,
  -- Denormalised so the RLS policy reads one table, matching 037's entries.
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL
                   CHECK (status IN ('applied','screening','interview','offer','rejected')),
  -- What happened, in the learner's words: "30 min with the hiring manager".
  note           TEXT,
  occurred_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The timeline reads one application's events oldest-first; the "ever reached
-- interview" stat sweeps every event this user has. Both are covered here.
CREATE INDEX IF NOT EXISTS monitor_application_events_app_idx
  ON monitor_application_events (application_id, occurred_on, created_at);
CREATE INDEX IF NOT EXISTS monitor_application_events_user_idx
  ON monitor_application_events (user_id, status);

ALTER TABLE monitor_application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitor_application_events_owner_all" ON monitor_application_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Backfill: applications created before this migration have a status but no
-- history. Seed one event from what is already known — the status they hold, on
-- the day they were applied for. This invents no information: both values are
-- copied from the row itself. Without it those applications would show an empty
-- timeline while displaying a status, which reads as data loss.
INSERT INTO monitor_application_events (application_id, user_id, status, occurred_on, note)
SELECT a.id, a.user_id, a.status, a.applied_on, NULL
FROM   monitor_applications a
WHERE  NOT EXISTS (
  SELECT 1 FROM monitor_application_events e WHERE e.application_id = a.id
);
