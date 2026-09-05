-- ── 050: surface provisioning — keep the personal-data surfaces off the ──────
-- ── public path until they are deliberately granted                     ──────
--
-- Part of the privacy pass (WISHLIST.md, "Privacy — pre-deployment blocker").
-- Signup is open and email verification auto-approves, so anyone who verifies
-- an address currently reaches every surface. Two of those surfaces hold the
-- richest personal material in the product:
--
--   * /notes            — uploaded screenshots. Unbounded content (a work
--                         dashboard, an email, a salary line), and every one is
--                         sent to OpenAI's vision model to be read.
--   * /monitor          — résumés, cover letters, and the applications history
--     (documents +        that sits beside them: which companies, which roles,
--      applications)      what happened. That is employment data.
--
-- This migration puts both behind a per-learner flag, default OFF, so the
-- public product simply does not accept that material. It is the cheapest way
-- to shrink what a privacy policy has to cover, and it is reversible per
-- learner without a further migration.
--
-- WHY THIS IS IN SQL AND NOT AN ENVIRONMENT VARIABLE
--
-- The API routes use the service-role client, which bypasses RLS, so they
-- enforce ownership themselves. But the browser also holds a real session, and
-- the existing storage policies let any authenticated user write to their own
-- folder DIRECTLY with the anon key:
--
--   FOR INSERT WITH CHECK (bucket_id = 'note-images'
--                          AND (storage.foldername(name))[1] = auth.uid()::text)
--
-- A gate that lives only in TypeScript would therefore hold for the UI and not
-- for anyone willing to open devtools — and a privacy claim that depends on
-- nobody trying is not a privacy claim. Postgres cannot read an env var, so
-- the flag has to be a column.
--
-- NO ADMIN BYPASS, DELIBERATELY
--
-- The admin backfill below sets the columns TRUE rather than the policies
-- special-casing is_admin. One rule, evaluated the same way in the app and in
-- the database. A bypass on one side only is how a UI comes to show something
-- the database will then refuse.
--
-- WHAT THIS DOES NOT DO
--
-- It does not delete anything, and it does not touch the learning diary,
-- `goal_answers`, `operation_events`, or the email address on every account.
-- Those remain in scope for the rest of the privacy pass. Verified before
-- writing this: of 12 profiles, every row in `notes`, `note_images`,
-- `monitor_documents` and `monitor_applications` belongs to the single admin
-- account, so no learner loses access to data they already had.

-- ── The flags ────────────────────────────────────────────────────────────────
-- Two, not one: screenshots and résumés are different material and will very
-- likely be opened up at different times. Separating them costs nothing here
-- and avoids a second migration later.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notes_enabled        BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS monitor_docs_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.notes_enabled IS
  'Grants /notes (screenshot upload + vision coaching). Default false: this surface accepts arbitrary personal content and sends it to OpenAI.';
COMMENT ON COLUMN profiles.monitor_docs_enabled IS
  'Grants Monitor documents + applications (résumés, cover letters, employment history). Default false.';

-- Existing admins keep what they already have. This is the backfill referred
-- to above — it is what makes "no admin bypass in the policies" safe.
UPDATE profiles SET notes_enabled = true, monitor_docs_enabled = true
WHERE is_admin = true;

-- ── The predicates ───────────────────────────────────────────────────────────
-- SECURITY DEFINER so evaluating a policy on `notes` does not re-enter the
-- policy on `profiles`. STABLE so the planner may cache it within a statement.
-- `search_path` is pinned: a SECURITY DEFINER function without it is how a
-- privilege escalation gets written by accident.
--
-- COALESCE to false means an absent profile row reads as "not provisioned".
-- This gate fails CLOSED, which is the opposite of the usage gate in
-- `lib/usage.ts` — that one fails open so a flaky query cannot lock a learner
-- out of the product. The asymmetry is deliberate: availability degrades
-- toward letting someone in, privacy degrades toward keeping them out.

CREATE OR REPLACE FUNCTION public.notes_provisioned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT notes_enabled FROM profiles WHERE user_id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.monitor_docs_provisioned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT monitor_docs_enabled FROM profiles WHERE user_id = auth.uid()), false);
$$;

-- ── Notes tables ─────────────────────────────────────────────────────────────
-- Each policy keeps its original ownership rule and gains the provisioning
-- check. Ownership alone was never the question; "may this account hold this
-- kind of data at all" is the new one.

DROP POLICY IF EXISTS "notebooks_owner_all" ON notebooks;
CREATE POLICY "notebooks_owner_all" ON notebooks
  FOR ALL USING      (auth.uid() = user_id AND public.notes_provisioned())
          WITH CHECK (auth.uid() = user_id AND public.notes_provisioned());

DROP POLICY IF EXISTS "notes_owner_all" ON notes;
CREATE POLICY "notes_owner_all" ON notes
  FOR ALL USING      (auth.uid() = user_id AND public.notes_provisioned())
          WITH CHECK (auth.uid() = user_id AND public.notes_provisioned());

DROP POLICY IF EXISTS "note_images_owner_all" ON note_images;
CREATE POLICY "note_images_owner_all" ON note_images
  FOR ALL USING      (auth.uid() = user_id AND public.notes_provisioned())
          WITH CHECK (auth.uid() = user_id AND public.notes_provisioned());

DROP POLICY IF EXISTS "note_messages_owner_all" ON note_messages;
CREATE POLICY "note_messages_owner_all" ON note_messages
  FOR ALL USING      (auth.uid() = user_id AND public.notes_provisioned())
          WITH CHECK (auth.uid() = user_id AND public.notes_provisioned());

-- ── Monitor documents and applications ───────────────────────────────────────
-- Note what is NOT here: `monitor_skills`, `monitor_skill_entries` and
-- `activity_events` are untouched. "I am level 3 at SQL" is not personal data
-- in the way a résumé is, and gating the whole tool would cost the learner a
-- useful surface for no privacy gain.

DROP POLICY IF EXISTS "monitor_documents_owner_all" ON monitor_documents;
CREATE POLICY "monitor_documents_owner_all" ON monitor_documents
  FOR ALL USING      (auth.uid() = user_id AND public.monitor_docs_provisioned())
          WITH CHECK (auth.uid() = user_id AND public.monitor_docs_provisioned());

DROP POLICY IF EXISTS "monitor_document_versions_owner_all" ON monitor_document_versions;
CREATE POLICY "monitor_document_versions_owner_all" ON monitor_document_versions
  FOR ALL USING      (auth.uid() = user_id AND public.monitor_docs_provisioned())
          WITH CHECK (auth.uid() = user_id AND public.monitor_docs_provisioned());

DROP POLICY IF EXISTS "monitor_applications_owner_all" ON monitor_applications;
CREATE POLICY "monitor_applications_owner_all" ON monitor_applications
  FOR ALL USING      (auth.uid() = user_id AND public.monitor_docs_provisioned())
          WITH CHECK (auth.uid() = user_id AND public.monitor_docs_provisioned());

DROP POLICY IF EXISTS "monitor_application_events_owner_all" ON monitor_application_events;
CREATE POLICY "monitor_application_events_owner_all" ON monitor_application_events
  FOR ALL USING      (auth.uid() = user_id AND public.monitor_docs_provisioned())
          WITH CHECK (auth.uid() = user_id AND public.monitor_docs_provisioned());

-- ── Storage objects ──────────────────────────────────────────────────────────
-- The half a TypeScript gate can never cover: these are what the browser can
-- reach directly with its own session.

DROP POLICY IF EXISTS "note_images_storage_owner_select" ON storage.objects;
CREATE POLICY "note_images_storage_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.notes_provisioned()
  );

DROP POLICY IF EXISTS "note_images_storage_owner_insert" ON storage.objects;
CREATE POLICY "note_images_storage_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.notes_provisioned()
  );

DROP POLICY IF EXISTS "note_images_storage_owner_delete" ON storage.objects;
CREATE POLICY "note_images_storage_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.notes_provisioned()
  );

DROP POLICY IF EXISTS "monitor_documents_storage_owner_select" ON storage.objects;
CREATE POLICY "monitor_documents_storage_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'monitor-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.monitor_docs_provisioned()
  );

DROP POLICY IF EXISTS "monitor_documents_storage_owner_insert" ON storage.objects;
CREATE POLICY "monitor_documents_storage_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'monitor-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.monitor_docs_provisioned()
  );

DROP POLICY IF EXISTS "monitor_documents_storage_owner_delete" ON storage.objects;
CREATE POLICY "monitor_documents_storage_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'monitor-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.monitor_docs_provisioned()
  );
