-- ── Diary entries: keep what was actually covered ────────────────────────
-- `body` is a 3-4 sentence narrative of how a session unfolded ("the student
-- explored dot products…"). It records the shape of a conversation, not its
-- content, which is why review quizzes generated from it drifted into material
-- the learner never discussed: the model had topic labels and nothing else to
-- work from, so it filled the gap with textbook knowledge.
--
-- Two additions, both nullable — every existing entry and every hand-written
-- entry simply has neither:
--
--   covered    — the substantive points the session actually established,
--                as [{ "point": "...", "detail": "..." }]. This is what review
--                quizzes are built from when present.
--   transcript — the session that produced the entry, as
--                [{ "role": "user" | "assistant", "content": "..." }], so a
--                past conversation can be re-read rather than only summarised.
ALTER TABLE milestone_entries
  ADD COLUMN IF NOT EXISTS covered    JSONB,
  ADD COLUMN IF NOT EXISTS transcript JSONB;

COMMENT ON COLUMN milestone_entries.covered IS
  'Substantive points established in the session: [{point, detail}]. Source material for review quizzes.';

COMMENT ON COLUMN milestone_entries.transcript IS
  'The session that produced this entry: [{role, content}]. Stored for re-reading, not sent to quiz generation.';
