-- ── 041: drop the superseded résumé and cover-letter columns ────────────────
--
-- THIS MIGRATION IS DESTRUCTIVE AND IRREVERSIBLE. Run it only after 040 has
-- been applied and the document library has been confirmed working.
--
-- Migration 040 moved every pasted résumé and cover letter into
-- monitor_documents / monitor_document_versions and repointed each application
-- at the version it was sent. These two columns are what is left behind: unread
-- by any code and undeclared by any type since 040 shipped.
--
-- They are dropped rather than left in place because a CV with two homes is the
-- exact failure 040 exists to remove — one of the two would silently become the
-- stale one, and nothing would say which.
--
-- Before running, confirm this returns zero:
--
--   SELECT count(*) FROM monitor_applications
--   WHERE resume_text IS NOT NULL OR cover_letter IS NOT NULL;
--
-- A non-zero count means 040's backfill did not run or did not finish. Stop and
-- re-run 040's DO block rather than dropping the columns — the text in them
-- exists nowhere else.

ALTER TABLE monitor_applications
  DROP COLUMN IF EXISTS resume_text,
  DROP COLUMN IF EXISTS cover_letter;
