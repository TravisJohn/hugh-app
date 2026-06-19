-- Tracks whether a milestone in the 'review' column has been validated.
-- Defaults false; reset to false whenever a card enters the review column.
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS review_validated BOOLEAN NOT NULL DEFAULT false;
