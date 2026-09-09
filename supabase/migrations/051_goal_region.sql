-- ── Which region of the map a goal belongs to ───────────────────────────────
--
-- /home/learn draws the learner's work as a sphere of clusters, one per
-- learning region, and a region brightens as milestones in it are mastered.
-- That needs each goal filed under exactly one region, and this is where the
-- filing is kept.
--
-- It is written by the topic gate, which already runs server-side on every goal
-- and already has the topic in front of it, so filing costs no extra model call
-- and asks the learner nothing.
--
-- Deliberately NULLABLE, with no CHECK constraint and no default:
--
--   NULL is a real state. Every goal that existed before today has it, the gate
--   omits the region whenever it cannot honestly pick one, and a failed-open
--   gate never returns one at all. A goal with no region simply lights nothing,
--   which is the correct behaviour rather than an error to repair.
--
--   No CHECK, because the set of regions is a product decision that lives in
--   lib/learn/regions.ts and will change more often than the schema should.
--   The value is validated in code by `isRegionId` before it is ever written —
--   an unrecognised region is dropped there, so this column only ever receives
--   a name the app knows. A constraint here would mean a migration every time
--   the list is edited, to enforce something already enforced upstream.
--
-- Not backfilled. Older goals could only be filed by re-running the judge over
-- every one of them, which would spend real money to colour in history nobody
-- is waiting on. They stay dark until someone decides that is worth doing.

ALTER TABLE learning_goals
  ADD COLUMN IF NOT EXISTS region TEXT;

-- The progress query reads every goal for one learner and groups by region.
CREATE INDEX IF NOT EXISTS learning_goals_user_region_idx
  ON learning_goals (user_id, region);

COMMENT ON COLUMN learning_goals.region IS
  'Learning region id from lib/learn/regions.ts, assigned by the topic gate. NULL where unknown; validated in code, not by a constraint.';
