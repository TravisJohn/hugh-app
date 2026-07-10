-- ── Notes: per-screenshot threads ───────────────────────────────────────────
-- Refinement of migration 027. Originally a note had many screenshots but a
-- single note-level chat thread, so a thought/correction wasn't tied to the
-- screenshot it was about. We now:
--   1. give every screenshot a renameable title (default "Screenshot N"), and
--   2. tag each chat message to a specific screenshot (note_messages.image_id).
--
-- The thread is therefore scoped per screenshot: selecting a screenshot shows
-- only its own thoughts + coaching, and the Coach reads only that one image.
--
-- Backfill note: any messages written before this migration keep image_id = NULL
-- and simply no longer surface under a screenshot (acceptable — pre-launch data).

-- ── 1. Screenshot titles ─────────────────────────────────────────────────────
ALTER TABLE note_images
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Screenshot';

-- ── 2. Tag messages to a screenshot ──────────────────────────────────────────
-- ON DELETE CASCADE: deleting a screenshot removes its whole thread with it.
ALTER TABLE note_messages
  ADD COLUMN IF NOT EXISTS image_id UUID REFERENCES note_images(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS note_messages_image_idx ON note_messages (image_id, created_at);
