-- ── 044: activity_events — the Usage view's data ───────────────────────────
--
-- One row per learner per surface per day. A forty-message chat is one day of
-- using Ask Hugh, not forty, so the grid answers "did I show up" rather than
-- "how chatty was I" — but `hits` still counts, so the ramp has real gradation
-- instead of a binary on/off.
--
-- THIS IS NOT `usage_logs`, and the separation is load-bearing. `usage_logs`
-- records token spend and prices it; Cases, Case Lab and code drills spend
-- nothing at all, so their calendars would be permanently blank there no matter
-- how heavily used. Adding page views to `usage_logs` would also corrupt the
-- per-row per-model cost maths migration 036 got right. See CLAUDE.md.
--
-- The two also speak different vocabularies: `usage_logs.feature` is
-- route-level (`learn/chat`, `mastery/evaluate`), `activity_events.feature` is
-- surface-level (`ask`, `mastery`) — the ten ids in lib/monitor/features.ts.

CREATE TABLE IF NOT EXISTS activity_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A surface id from the registry. Deliberately NOT a CHECK constraint: the
  -- registry is TypeScript and adding a surface should not need a migration.
  -- An unknown id is simply never rendered, because the view iterates the
  -- registry rather than the table.
  feature    TEXT NOT NULL,
  event_date DATE NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The dedupe. Writes upsert against this and increment `hits`.
  UNIQUE (user_id, feature, event_date)
);

-- The read is always "this user's whole grid"; the unique index serves it.
CREATE INDEX IF NOT EXISTS activity_events_user_idx
  ON activity_events (user_id, event_date DESC);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_events_owner_all" ON activity_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Seeding from history that already exists ────────────────────────────────
--
-- Eight of the ten surfaces have dated rows in this database already, so the
-- Usage view can be useful the day it ships instead of in three months.
--
-- Be clear about what this is: `usage_logs` still cannot BE the Usage view — it
-- misses Case Lab entirely and under-reports every surface you can browse
-- without spending a token. It can seed one, once, with its limits stated. The
-- view marks the seam, because days before this migration count token spend and
-- attempts while days after count visits, and the two are not comparable.
--
-- `interview/*` and `tts` are deliberately excluded. The interview loop is a
-- legacy surface that is not on /home, and Monitor should not resurrect it as a
-- visible one; `tts` cannot be attributed to a single surface anyway.
--
-- Every insert is ON CONFLICT DO NOTHING, so re-running this migration is
-- harmless and it can never overwrite a real event with a seeded one.

-- Ask Hugh — the tutor chat and the diary summariser.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'ask', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   usage_logs WHERE feature LIKE 'learn/%'
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Ask Hugh — diary entries written on the ask page.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'ask', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   milestone_entries
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Learn — the track board and goal creation.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'learn', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   usage_logs WHERE feature LIKE 'tracker/%' OR feature LIKE 'dashboard/%'
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Review quiz.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'review', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   usage_logs WHERE feature LIKE 'review/%'
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Prove mastery.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'mastery', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   usage_logs WHERE feature LIKE 'mastery/%'
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Cloud reference — chat days only. Browsing the reference spent nothing and
-- left no trace, so this history is real but partial. The view says so.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'cloud', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   usage_logs WHERE feature LIKE 'cloud/%'
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Notes — the Coach and the summariser.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'notes', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   usage_logs WHERE feature LIKE 'notes/%'
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Notes — screenshots captured and coaching messages, which happen on days you
-- may never have invoked a model.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'notes', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   note_images
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'notes', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   note_messages
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Code drills — every attempt, pass or fail. These spend no tokens, which is
-- exactly why this table exists.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'code-drill', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   code_drill_attempts
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'code-drill', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   usage_logs WHERE feature = 'code/generate-drill'
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Code sandbox — chat days only. Running Python in the browser left no trace.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'code-sandbox', (created_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   usage_logs WHERE feature = 'code/chat'
GROUP  BY user_id, (created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- The Case Room. NOTE: this table dates rows with `completed_at`, not
-- `created_at` — see 023_case_room.sql.
INSERT INTO activity_events (user_id, feature, event_date, hits)
SELECT user_id, 'cases', (completed_at AT TIME ZONE 'UTC')::date, COUNT(*)
FROM   case_attempts
GROUP  BY user_id, (completed_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, feature, event_date) DO NOTHING;

-- Case Lab has no seed. It is all-public, zero runtime AI, and writes nothing
-- anywhere — so it genuinely starts empty, and the view labels it rather than
-- letting an empty grid read as "never used".
