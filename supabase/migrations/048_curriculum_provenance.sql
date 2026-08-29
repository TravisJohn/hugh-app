-- ── 048: curriculum provenance ─────────────────────────────────────────────
--
-- Records what a learner said, which generator read it, and what curriculum
-- came out — so that "does context produce a better track?" becomes a question
-- with an answer instead of an opinion.
--
-- Two tables, split along the deletion boundary:
--
--   goal_answers       the learner's words. Learner-owned, normal RLS, and
--                      deletable, because they are the learner's.
--   track_generations  the eval record. Service-role only, the same stance
--                      operation_events takes.
--
-- The split is what makes two requirements compatible. Deleting the answers
-- removes the words while the generation row keeps the model, the prompt, the
-- milestone count and the outcome — so model comparison survives a deletion
-- without retaining anything the learner asked to be forgotten.

-- ── 048a: goal_answers — the context behind a curriculum ───────────────────
--
-- The 5-whys answers were previously used once, to produce a 5-10 word refined
-- title, and then discarded. Everything downstream read only those few words.
-- This is where they start being kept.
--
-- Retention stance: keep indefinitely by default, and let the learner delete.
-- No TTL job. The learner-facing delete is a server-side action rather than a
-- policy, because it also has to reach the generation rows below.

CREATE TABLE IF NOT EXISTS goal_answers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  goal_id    UUID        NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,

  -- 0-based order asked. The 5-whys prompt digs one level deeper each turn,
  -- so position carries meaning: answer 4 is not answer 0.
  position   SMALLINT    NOT NULL,

  question   TEXT        NOT NULL,
  answer     TEXT        NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A goal has at most one answer per position, so a double-submit is
  -- idempotent rather than duplicating the learner's context. Note the scope:
  -- this dedupes within a goal, not across two goals. A lost response can
  -- leave the learner creating a second goal carrying the same answers; both
  -- are visible in their library, so a per-goal delete still reaches each.
  UNIQUE (goal_id, position)
);

CREATE INDEX IF NOT EXISTS goal_answers_goal_idx
  ON goal_answers (goal_id, position);

ALTER TABLE goal_answers ENABLE ROW LEVEL SECURITY;

-- FOR ALL, so the DELETE the learner is promised actually works.
DROP POLICY IF EXISTS "goal_answers_owner_all" ON goal_answers;
CREATE POLICY "goal_answers_owner_all" ON goal_answers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── 048b: track_generations — what produced which curriculum ───────────────
--
-- The fourth telemetry store, and it has to earn that. The other three are all
-- keyed to a learner and a period of time:
--
--   usage_logs        spend, priced per row at that row's own model rate
--   activity_events   engagement, deduped to one row per learner per surface
--                     per day, so it structurally cannot hold per-generation
--                     anything
--   operation_events  per-attempt outcomes, with every detail string capped at
--                     40 characters SPECIFICALLY so free text cannot arrive
--
-- This is the only one keyed to a single generation EVENT, with its input and
-- its output attached so the two can be compared. That is the property none of
-- the three can be extended to have, and it is why a milestone snapshot cannot
-- simply go in operation_events: it is exactly what that 40-character cap
-- exists to exclude, and raising the cap would destroy the property that makes
-- that table safe to keep forever.

CREATE TABLE IF NOT EXISTS track_generations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SET NULL, not CASCADE. A deleted account should not silently delete the
  -- record that a model produced a 14-milestone track in 40s; the row survives
  -- de-identified. The learner's words go with the account, because
  -- goal_answers cascades.
  user_id            UUID        REFERENCES auth.users(id)     ON DELETE SET NULL,

  -- This null is also how a goal deletion detaches a row from its input — and
  -- goal deletion is a one-click library action, not a privacy action, so it
  -- happens far more often than an account deletion. The delete handlers flip
  -- input_intact at the same time, so the detachment is recorded rather than
  -- merely happening. Deleting a goal is also a SYSTEM action: the document
  -- upload flow uses it as rollback cleanup.
  goal_id            UUID        REFERENCES learning_goals(id) ON DELETE SET NULL,

  -- Null when generation failed, or when a rebuild replaced the track.
  track_id           UUID        REFERENCES tracks(id)         ON DELETE SET NULL,

  -- ── The generator ────────────────────────────────────────────────────────
  -- What the generator ACTUALLY SAW, which is not always where the goal came
  -- from. The approve route deletes the extracted document text once
  -- generation has read it, so retrying a document-sourced goal rebuilds it
  -- from the topic alone — and that generation genuinely had no document.
  source_kind        TEXT        NOT NULL CHECK (source_kind IN ('qa', 'document')),

  model              TEXT        NOT NULL,

  -- Written by lib/claude/promptIdentity.ts, never by hand. The fingerprint is
  -- a hash of the prompt TEMPLATE rendered with placeholders — not the prompt
  -- as sent, which would differ per generation and would also make this column
  -- a value derived from the learner's topic sitting in a table they cannot
  -- reach. prompt_version is looked up from a registry keyed by fingerprint,
  -- so it cannot drift from it the way a hand-bumped constant can.
  --
  -- The model is deliberately NOT part of the fingerprint: "same prompt,
  -- different model" is the eval's central comparison and has to stay
  -- expressible as fingerprint equality.
  prompt_version     TEXT        NOT NULL,
  prompt_fingerprint TEXT        NOT NULL,

  -- Also shapes the output, so it belongs to the row rather than to the
  -- prompt's identity: a long track can be truncated by this ceiling, which
  -- presents as a parse error and burns the retry.
  max_tokens         INTEGER,

  -- ── The input ────────────────────────────────────────────────────────────
  -- The topic as actually sent. Snapshotted because the goal it came from can
  -- be deleted, and because a replay sends a historical value.
  input_topic        TEXT        NOT NULL,

  -- How many answers existed, and whether generation actually READ them.
  -- Every row written before the generation prompt starts consuming answers
  -- has answer_count > 0 with context_used = false — real learners, real
  -- topics, demonstrably no context. That is the control arm, accumulating for
  -- free from the day this ships.
  answer_count       SMALLINT    NOT NULL DEFAULT 0,
  context_used       BOOLEAN     NOT NULL DEFAULT FALSE,

  -- ── What the input was like, kept as numbers ─────────────────────────────
  -- Derived from the answers at generation time by lib/learn/contextUptake.ts.
  -- Numbers, not text: they are not personal data, and they outlive the rows
  -- they came from. This is what lets a deletion remove the words without
  -- blinding the eval.
  --
  -- Total characters the learner wrote. Answers "did more context help?"
  -- without keeping the context.
  answer_chars       INTEGER     NOT NULL DEFAULT 0,

  -- Fraction of the learner's distinct content terms that reappear in the
  -- generated milestones. NULL means there was no context to take up, which is
  -- a different fact from 0.0 (context existed and was ignored).
  --
  -- Frozen at write time rather than joined at read time on purpose: a join
  -- silently returns a different number once the answers are deleted, on a row
  -- that still reads answer_count = 5.
  context_uptake     REAL,

  -- FALSE once the input behind this row is gone — answers deleted, goal
  -- deleted, or account deleted. Makes that loss visible instead of silent:
  -- the replay harness selects WHERE input_intact, and a query can report
  -- "6 of these 40 rows no longer have their input" rather than returning 34
  -- rows and looking complete.
  input_intact       BOOLEAN     NOT NULL DEFAULT TRUE,

  -- ── The output, as the learner received it ───────────────────────────────
  -- The assembled board AFTER ranking, per milestone:
  --   { title, summary, column, position, priority_rank, priority_reason }
  --
  -- Not the first call's parse result. THREE model calls shape a curriculum
  -- and generateMilestones is only the first; the ranking is applied by UPDATE
  -- after the insert, so it is absent from that parse entirely. Ordering is
  -- most of what "is this a good curriculum?" means, and every outcome measure
  -- joins back to the board the learner was actually handed.
  --
  -- Frozen because the live milestones table is the learner's board: dragging
  -- a card rewrites kanban_column within a day of use.
  --
  -- NOT in here, deliberately: learning_points. They are the third call,
  -- generated lazily per milestone on first open — days after this row is
  -- written — so they cannot be captured at generation time. If they ever need
  -- provenance it is a per-milestone row, not a column here.
  milestones_out     JSONB,
  milestone_count    SMALLINT,

  -- ── The second model call ────────────────────────────────────────────────
  -- assignBacklogPriority's failure is swallowed by design: a failed ranking
  -- costs the learner a suggested order, not their track. Recorded so that a
  -- partial failure is not indistinguishable from a clean success — without
  -- this, two tracks with identical milestones_out, one ranked and one not,
  -- read the same.
  ranked             BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Null when ranking failed or was skipped. Separate from `model` above, so
  -- moving the ranker to a cheaper model is visible in the eval rather than
  -- silent: without these, that change moves no field on this row at all.
  rank_model         TEXT,
  rank_fingerprint   TEXT,

  -- How many milestones named a kanban column that isn't real and were coerced
  -- to 'backlog' on insert. The gap between what the model meant and what
  -- shipped, kept as a count rather than a second JSONB copy of the output.
  columns_coerced    SMALLINT    NOT NULL DEFAULT 0,

  -- ── How it went ──────────────────────────────────────────────────────────
  -- GENERATION-scoped, and deliberately narrower than operation_events, which
  -- is attempt-scoped over the whole build. There is no 'refused' here on
  -- purpose: a usage-gate refusal generates nothing, so it writes an operation
  -- row and no row here. Reliability read from the two tables therefore
  -- differs by exactly the refusals. That is 047's rule working — refused is
  -- not failed — so do not "fix" the mismatch.
  outcome            TEXT        NOT NULL CHECK (outcome IN ('ok', 'failed')),

  -- Class only, never a stack and never model output — same rule as
  -- operation_events.
  error_class        TEXT,

  -- generateMilestones retries once and folds both attempts' tokens into a
  -- single usage_logs row, so the attempt count exists nowhere else. "How
  -- often does this model need a second try to return parseable JSON?" is a
  -- first-class model-quality measure and this is the only column that answers
  -- it.
  attempts           SMALLINT    NOT NULL DEFAULT 1,

  -- NOT duration_ms. operation_events.duration_ms times the whole after()
  -- block — generation, the status update, and its own write. This times the
  -- generation alone. Two different spans, so two different names.
  generation_ms      INTEGER,

  -- Both model calls, summed. THESE ARE NOT THE COST RECORD. usage_logs is
  -- authoritative for spend and for everything the admin console shows, priced
  -- per row at each row's own model rate; it holds these same tokens as two
  -- rows, under features 'tracker/generate' and 'tracker/priority'. These
  -- columns exist to price one generation against another and must never be
  -- summed into a cost report.
  --
  -- The one exception is a replay — see is_replay.
  tokens_in          INTEGER,
  tokens_out         INTEGER,

  -- True when written by the offline replay harness rather than by a real
  -- learner. Without this, replaying 200 historical inputs against a new model
  -- would swamp the live statistics with traffic nobody ever saw.
  --
  -- A replay writes NO usage_logs row. It cannot: usage_logs.user_id is NOT
  -- NULL against auth.users and a replay has no learner. Billing it to a real
  -- one would spend their quota on traffic they never triggered. So for replay
  -- rows the token columns above are the only record of that spend there is.
  is_replay          BOOLEAN     NOT NULL DEFAULT FALSE
);

-- The eval read is always "these generators, compared".
CREATE INDEX IF NOT EXISTS track_generations_model_idx
  ON track_generations (model, prompt_fingerprint, created_at DESC);

-- The outcome join walks back from a track the learner actually used.
CREATE INDEX IF NOT EXISTS track_generations_track_idx
  ON track_generations (track_id);

-- The replay harness selects its corpus from rows whose input still exists.
CREATE INDEX IF NOT EXISTS track_generations_corpus_idx
  ON track_generations (goal_id) WHERE input_intact AND NOT is_replay;

ALTER TABLE track_generations ENABLE ROW LEVEL SECURITY;

-- No policy, deliberately — RLS with no policy denies everyone. Writes and
-- reads both go through the service role. Same stance as operation_events:
-- this is operator data about the system, not learner data about a person.
--
-- The consequence to accept: input_topic and milestones_out are
-- learner-derived text in a table the learner cannot reach. The learner-facing
-- delete is therefore a server-side action that clears goal_answers, nulls
-- those two columns, and sets input_intact = false on the related rows — and
-- the goal DELETE handler has to do the same, because it is the same outcome
-- reached by a different button.
