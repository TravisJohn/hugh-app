-- Mastery summary document + the mastery conversation's latest verdict.
--
-- When a milestone is mastered, Hugh generates an AI "what you learned" summary
-- document (markdown) from the learner's diary, the milestone checklist, and the
-- mastery evaluation. It is auto-generated on first mastery and regenerable on
-- demand. `mastery_feedback` persists the latest evaluation text so the summary
-- (and regeneration) can reference the mastery conversation without storing the
-- full transcript.
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS mastery_feedback TEXT,
  ADD COLUMN IF NOT EXISTS summary_doc      TEXT,
  ADD COLUMN IF NOT EXISTS summary_doc_at   TIMESTAMPTZ;
