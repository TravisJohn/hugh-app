-- ── 047: operation_events — did it work, how long, and why not ─────────────
--
-- The third telemetry store, and the separation is load-bearing.
--
--   usage_logs       spend.      One row per API call, priced per row per model.
--   activity_events  engagement. One row per learner per surface PER DAY.
--   operation_events outcomes.   One row per ATTEMPT.
--
-- Neither existing table can absorb this. `usage_logs` is priced per row, so
-- non-spend rows would corrupt the per-model cost maths migration 036 got
-- right. `activity_events` is deduped by a unique constraint to one row per
-- day, so it structurally cannot hold per-attempt anything. See CLAUDE.md and
-- PRD-observability.md §3.

CREATE TABLE IF NOT EXISTS operation_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- An id from the registry in lib/observability/operations.ts.
  -- Deliberately NOT a CHECK constraint, for the same reason
  -- activity_events.feature has none: adding an operation should be a
  -- TypeScript change, not a migration. An unknown id renders nowhere,
  -- because the admin panel iterates the registry rather than the table.
  operation   TEXT        NOT NULL,

  -- 'ok' | 'failed' | 'refused'.
  --
  -- Three values, not two, and 'refused' is the load-bearing one: a usage-gate
  -- block, an off-domain topic, or a 409 "still building" is the system
  -- working correctly. Folding those into 'failed' would make a healthy
  -- product look broken. Constrained here because — unlike the operation
  -- vocabulary — this set is not meant to grow.
  outcome     TEXT        NOT NULL CHECK (outcome IN ('ok', 'failed', 'refused')),

  -- Null when the caller could not measure it (e.g. a refusal that happened
  -- before any work started). Nulls are excluded from percentiles rather than
  -- counted as zero, which would drag every p50 towards nothing.
  duration_ms INTEGER,

  -- The error's class only. Never a stack trace: this is not error
  -- monitoring, and a stack can quote source that contains prompts.
  error_class TEXT,

  -- The sanitised message: redacted against the learner strings the caller
  -- passed, then truncated to 200 characters. See lib/observability/sanitize.ts.
  error_note  TEXT,

  -- Bounded primitives only — numbers, booleans, and strings capped at 40
  -- characters. Enforced in TypeScript by sanitizeDetail(), which is what
  -- guarantees free text cannot arrive through this column.
  detail      JSONB
);

-- The panel's read is always "these operations, over this window".
CREATE INDEX IF NOT EXISTS operation_events_op_created
  ON operation_events (operation, created_at DESC);

-- "Did this fail for everyone or for one account?" is worth answering.
CREATE INDEX IF NOT EXISTS operation_events_user_created
  ON operation_events (user_id, created_at DESC);

ALTER TABLE operation_events ENABLE ROW LEVEL SECURITY;

-- No policy is defined on purpose. This is operator data about the system, not
-- learner data about a person, and RLS with no policy denies everyone. Writes
-- come from the service role (which bypasses RLS) and reads come from /admin
-- through the same client. A learner has no route to these rows.
