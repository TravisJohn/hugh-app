-- ── Notes: screenshot-driven learning notes with a per-note Coach chat ────────
-- The "Notes" workspace lets a learner capture a test-bank question they got
-- wrong (a screenshot), write down their reasoning, then ask Hugh (OpenAI vision)
-- to read the image + their thoughts and correct them — a full chat scoped to
-- that one note.
--
-- Shape (all personal, one-owner):
--   notebooks  ── tree branches ("GCP Data Engineer")
--     notes    ── leaves ("Untitled" → renameable)
--       note_images    ── screenshots (bytes live in the note-images bucket)
--       note_messages  ── the chat thread (user thoughts + Hugh's corrections)
--
-- The /api/notes/* routes read/write these via the service-role client and
-- always filter by the authenticated user_id. RLS owner-only policies are the
-- second line of defence in case a table is ever touched from a client session.

-- ── notebooks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notebooks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'Untitled notebook',
  position    INT         NOT NULL DEFAULT 0,   -- manual ordering in the tree
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notebooks_user_idx ON notebooks (user_id, position, created_at);

-- ── notes (leaves) ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notebook_id  UUID        NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL DEFAULT 'Untitled',
  position     INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notes_notebook_idx ON notes (notebook_id, position, created_at);
CREATE INDEX IF NOT EXISTS notes_user_idx     ON notes (user_id);

-- ── note_images ──────────────────────────────────────────────────────────────
-- One row per uploaded screenshot. The actual bytes live in Supabase Storage
-- (bucket 'note-images', path '<user_id>/<note_id>/<uuid>'); we keep only the
-- path + mime here and hand out short-lived signed URLs at read time.
CREATE TABLE IF NOT EXISTS note_images (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id       UUID        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  storage_path  TEXT        NOT NULL,
  mime          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS note_images_note_idx ON note_images (note_id, created_at);

-- ── note_messages (the per-note chat thread) ─────────────────────────────────
-- The learner's written thoughts are 'user' rows; Hugh's corrections are
-- 'assistant' rows. One ordered thread per note = "full chat per note".
CREATE TABLE IF NOT EXISTS note_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id     UUID        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS note_messages_note_idx ON note_messages (note_id, created_at);

-- ── Row Level Security: owner-only on every table ────────────────────────────
ALTER TABLE notebooks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notebooks_owner_all" ON notebooks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notes_owner_all" ON notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "note_images_owner_all" ON note_images
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "note_messages_owner_all" ON note_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Storage bucket for screenshots ───────────────────────────────────────────
-- Private bucket; all access goes through the service-role client in the API,
-- which bypasses these policies. The owner-only policies below are defence in
-- depth for the first path segment (the owner's user_id).
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-images', 'note-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "note_images_storage_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "note_images_storage_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "note_images_storage_owner_delete" ON storage.objects;

CREATE POLICY "note_images_storage_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "note_images_storage_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "note_images_storage_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
