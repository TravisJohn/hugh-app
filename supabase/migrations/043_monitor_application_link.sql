-- ── 043: a link back to the advert ─────────────────────────────────────────
--
-- Where the job was posted. Six weeks later you want to reread what they asked
-- for, check whether the listing is still up, or find the reference number for
-- a follow-up email — and none of that is in your own notes.
--
-- Worth being honest about what this does and does not do: a URL is a pointer,
-- not a copy. Job adverts are taken down the moment the role is filled, so the
-- link WILL rot, often within weeks. The thing that actually preserves the
-- advert is the `job_description` text pasted alongside it, which is why that
-- column exists and why the UI asks for both.
--
-- Nullable: plenty of applications come through a recruiter, a referral or an
-- email with no public listing at all.

ALTER TABLE monitor_applications
  ADD COLUMN IF NOT EXISTS job_url TEXT;

COMMENT ON COLUMN monitor_applications.job_url IS
  'Link to the original posting. http/https only, validated in lib/monitor/applications.ts. A pointer, not an archive — the pasted job_description is what survives the listing coming down.';
