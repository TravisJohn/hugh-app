ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS mastery_validated BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mastery_score     INTEGER            DEFAULT NULL;
