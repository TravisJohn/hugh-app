-- ── 045: learner_notes — the margin ────────────────────────────────────────
--
-- One plain-text note per learner per thing-being-read. This is the digital
-- version of reaching for a physical notebook while reading a long reference
-- page: your own words, next to the paragraph that finally made sense.
--
-- NOT the `/notes` workspace, and the two must not be merged. That one is
-- screenshot-first — a `notes` row has no body at all, and every thread hangs
-- off an uploaded image analysed by a vision model. This one has no images, no
-- threads and no AI: it is a textarea that saves. They answer different
-- questions ("what did Hugh say about this screenshot" vs "what do I want to
-- remember from this page"), and collapsing them would force one of the two to
-- carry a data model it does not need.
--
-- ── Why the key is (surface, ref_id) and not (provider, service_id) ─────────
--
-- Cloud Skills is the first surface to get a margin, not the only one that
-- should have one. A Case, a code pack, a milestone card all want the same
-- affordance. Keying on the generic pair costs exactly the same today and means
-- the second surface is a component drop rather than a second table.
--
-- ── Why the row snapshots its own label and href ───────────────────────────
--
-- So the review list never has to know what a "cloud service" is. The
-- alternative — a per-surface resolver that turns 'aws/s3' into 'Amazon S3' —
-- would mean every future surface must register a resolver before its notes can
-- be listed at all. Both snapshots are rewritten on every save, so a renamed
-- service self-heals the next time you touch the note.

CREATE TABLE IF NOT EXISTS learner_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which surface the note was taken on ('cloud'). Deliberately not a CHECK:
  -- adding a surface is a TypeScript change, the same stance as 044.
  surface    TEXT NOT NULL,
  -- The thing annotated, scoped to the surface ('aws/s3').
  ref_id     TEXT NOT NULL,
  -- Display snapshots, refreshed on every write. See the note above.
  ref_label  TEXT NOT NULL,
  ref_href   TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A margin is one growing page per thing, not a stack of separate jots. The
  -- pad upserts against this.
  UNIQUE (user_id, surface, ref_id)
);

-- The review list reads "this user's notes on this surface, most recent first".
CREATE INDEX IF NOT EXISTS learner_notes_user_surface_idx
  ON learner_notes (user_id, surface, updated_at DESC);

ALTER TABLE learner_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learner_notes_owner_all" ON learner_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
