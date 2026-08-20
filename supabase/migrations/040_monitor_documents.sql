-- ── 040: résumés and cover letters become documents with versions ──────────
--
-- Migration 037 put `resume_text` and `cover_letter` on the application itself.
-- That models a CV as a property of one application, which it is not: apply to
-- twenty jobs with the same résumé and the database holds twenty unrelated
-- blobs of text with no way to tell they are the same document. The record
-- therefore cannot answer the question a job search actually asks — *which
-- résumé did I send where, and did it work?*
--
-- So a document is now a thing you maintain, a version is a state of it, and an
-- application REFERENCES the version it was sent. That reference is what makes
-- this query possible, and it is the whole point of the migration:
--
--   "Analytics Engineer CV v3 — sent to 7, 2 reached interview.
--    v4 — sent to 11, 4 reached interview."
--
-- Your CV versions, measured against outcomes. No AI, no inference; it falls
-- out of the join.
--
-- NOT in scope: uploaded PDF/DOCX files. That needs Supabase Storage, a bucket,
-- storage policies and MIME limits, and it changes what class of data Hugh
-- holds. Pasted text first, files later — the prototype's own recommendation.
-- `content` is the text; a future `file_path` column sits beside it, additive.

-- ── The document ────────────────────────────────────────────────────────────
-- Two kinds, closed by a CHECK, matching the two reference columns added below.
-- A third kind with nothing able to reference it would be a column that only
-- ever holds unused rows.
CREATE TABLE IF NOT EXISTS monitor_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('resume','cover_letter')),
  -- What you call it: "Analytics Engineer CV", "Cover letter — Halcyon Labs".
  label       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Soft delete, like a skill. A CV you stopped using is history: applications
  -- still point at its versions, and that record must survive.
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS monitor_documents_user_idx
  ON monitor_documents (user_id, kind, archived_at);

-- ── The version ─────────────────────────────────────────────────────────────
-- Append-only in practice: you add v4, you do not rewrite v3. Editing a version
-- that has already been sent somewhere would rewrite history — the application
-- would then claim to have sent text it never sent.
CREATE TABLE IF NOT EXISTS monitor_document_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES monitor_documents(id) ON DELETE CASCADE,
  -- Denormalised so the RLS policy reads one table, matching 037 and 039.
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL CHECK (version >= 1),
  content     TEXT,
  -- Why this version exists: "trimmed to one page, led with dbt".
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS monitor_document_versions_doc_idx
  ON monitor_document_versions (document_id, version DESC);

-- ── The reference ───────────────────────────────────────────────────────────
-- ON DELETE SET NULL, emphatically not CASCADE: deleting a document must never
-- delete the applications that were sent with it. The application survives with
-- an unknown attachment, which is a gap in the record — cascading would be a
-- hole in it.
ALTER TABLE monitor_applications
  ADD COLUMN IF NOT EXISTS resume_version_id UUID
    REFERENCES monitor_document_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_letter_version_id UUID
    REFERENCES monitor_document_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS monitor_applications_resume_idx
  ON monitor_applications (resume_version_id) WHERE resume_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS monitor_applications_cover_idx
  ON monitor_applications (cover_letter_version_id) WHERE cover_letter_version_id IS NOT NULL;

-- ── Migrate what is already pasted ──────────────────────────────────────────
-- Each application that carries résumé or cover-letter text becomes a document
-- with one version, and is repointed at it. Nothing is invented and nothing is
-- lost: the text moves, the label is built from data already on the row.
--
-- This is the only part of the change that touches existing data, and it only
-- adds: nothing is deleted here. Removing the old columns is migration 041.

DO $$
DECLARE r RECORD; doc_id UUID; ver_id UUID;
BEGIN
  FOR r IN SELECT id, user_id, company, resume_text, cover_letter
           FROM monitor_applications
           WHERE resume_text IS NOT NULL OR cover_letter IS NOT NULL
  LOOP
    IF r.resume_text IS NOT NULL THEN
      INSERT INTO monitor_documents (user_id, kind, label)
      VALUES (r.user_id, 'resume', 'Résumé — ' || r.company)
      RETURNING id INTO doc_id;

      INSERT INTO monitor_document_versions (document_id, user_id, version, content, note)
      VALUES (doc_id, r.user_id, 1, r.resume_text, 'Migrated from the application record')
      RETURNING id INTO ver_id;

      UPDATE monitor_applications SET resume_version_id = ver_id WHERE id = r.id;
    END IF;

    IF r.cover_letter IS NOT NULL THEN
      INSERT INTO monitor_documents (user_id, kind, label)
      VALUES (r.user_id, 'cover_letter', 'Cover letter — ' || r.company)
      RETURNING id INTO doc_id;

      INSERT INTO monitor_document_versions (document_id, user_id, version, content, note)
      VALUES (doc_id, r.user_id, 1, r.cover_letter, 'Migrated from the application record')
      RETURNING id INTO ver_id;

      UPDATE monitor_applications SET cover_letter_version_id = ver_id WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- The old columns are NOT dropped here. Dropping a column is irreversible and
-- this project has no rollback tooling, so the destructive half lives in its own
-- migration (041) that can be run once this one is confirmed working. Until then
-- the columns simply sit there unread: no code writes them and no type declares
-- them, so they are inert rather than a competing second home for a CV.
--
-- `job_description` and `notes` stay on the application permanently. They belong
-- to that one application and are never reused; only the things you send more
-- than once become documents.

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Owner-only, matching every other Monitor table. A résumé is the most personal
-- thing Hugh stores: there is deliberately no shared or admin-readable path to
-- its contents.
ALTER TABLE monitor_documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitor_documents_owner_all" ON monitor_documents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "monitor_document_versions_owner_all" ON monitor_document_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
