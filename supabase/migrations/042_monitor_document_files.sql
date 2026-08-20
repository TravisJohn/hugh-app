-- ── 042: the document file itself ──────────────────────────────────────────
--
-- Migration 040 stored a version's *text*. A résumé is not its words, though —
-- it is a laid-out artifact, and the version you actually sent is the PDF, not
-- a transcription of it. So a version can now carry the file as well.
--
-- Text and file are both optional but a version must have at least one: an
-- empty version would be a claim ("this is what I sent") with nothing behind it.
-- Keeping the text alongside the file is deliberate rather than redundant —
-- text is searchable and readable inline, the file is the thing that was sent.
--
-- Objects live in a PRIVATE bucket keyed `<user_id>/<document_id>/<uuid>.<ext>`,
-- exactly as note-images are. Reads are short-lived signed URLs minted per
-- request; the bucket is never public and the Storage key never reaches the
-- browser.

ALTER TABLE monitor_document_versions
  -- Storage object path. NULL means this version is text only.
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  -- The name as uploaded — "resume-analytics-eng-2026-06.pdf". Worth keeping:
  -- what you called the file is often how you remember which one it was.
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS mime      TEXT;

-- A version must carry something. Enforced here rather than only in the route,
-- because "which version did I send" must never resolve to an empty row.
--
-- Safe to add: every version written before this migration has text, since the
-- only way to create one required it.
ALTER TABLE monitor_document_versions
  DROP CONSTRAINT IF EXISTS monitor_document_versions_has_body;
ALTER TABLE monitor_document_versions
  ADD CONSTRAINT monitor_document_versions_has_body
  CHECK (content IS NOT NULL OR file_path IS NOT NULL);

-- ── The bucket ──────────────────────────────────────────────────────────────
-- Private. All access goes through the service-role client in /api/monitor/*,
-- which bypasses the policies below; they are defence in depth on the first
-- path segment (the owner's user_id), matching 027_notes.sql.
--
-- A résumé is the most personal thing Hugh stores — address, phone, full
-- employment history. There is deliberately no public path to these bytes and
-- no admin-readable one.
INSERT INTO storage.buckets (id, name, public)
VALUES ('monitor-documents', 'monitor-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "monitor_documents_storage_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "monitor_documents_storage_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "monitor_documents_storage_owner_delete" ON storage.objects;

CREATE POLICY "monitor_documents_storage_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'monitor-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "monitor_documents_storage_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'monitor-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "monitor_documents_storage_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'monitor-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
