-- ── Pinned thoughts: learner notes pinned to a drill card ────────────────────
-- In the Code drill, a learner can pin a chat message (a "thought") to a specific
-- step so it stays with that card for later reference. Unlike code_drills (shared,
-- generic), these are personal — scoped to the user and the pack they were taken
-- in — so they persist across devices and survive a cache clear.
--
-- The /api/code/pins route reads/writes this via the service-role client and
-- always filters by the authenticated user_id. RLS owner-only policies are the
-- second line of defence in case it's ever touched from an authenticated client.
CREATE TABLE IF NOT EXISTS pinned_thoughts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id     TEXT        NOT NULL,  -- the drill pack/topic the note was taken in
  card_id     TEXT        NOT NULL,  -- the cell it's pinned to
  text        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Load path is always "this user's pins for this pack", ordered by time.
CREATE INDEX IF NOT EXISTS pinned_thoughts_user_pack_idx
  ON pinned_thoughts (user_id, pack_id, created_at);

ALTER TABLE pinned_thoughts ENABLE ROW LEVEL SECURITY;

-- Owner-only: a learner can only see and mutate their own pins.
CREATE POLICY "pinned_thoughts_select_own" ON pinned_thoughts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pinned_thoughts_insert_own" ON pinned_thoughts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pinned_thoughts_delete_own" ON pinned_thoughts
  FOR DELETE USING (auth.uid() = user_id);
