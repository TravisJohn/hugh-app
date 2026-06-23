-- ── Milestone learning points + persistent focus ───────────────────────────
-- learning_points: an enumerated checklist of "things to understand" derived
--   from the card's goal. Powers the activity/coverage check and the Ask side-rail.
--   Shape: [{ "id": "p1", "text": "..." }, ...]
-- coverage: cached result of the last coverage assessment so the board/drawer
--   don't re-call Claude on every load.
--   Shape: { "coveredIds": ["p1","p3"], "updatedAt": "ISO-8601" }
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS learning_points JSONB,
  ADD COLUMN IF NOT EXISTS coverage        JSONB;

-- focus_milestone_id: the learner's persistent "current focus" for this track.
--   The glowing card on the board and the goal carried into Ask both read this.
--   Stays put until the learner picks a different card.
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS focus_milestone_id UUID
    REFERENCES milestones(id) ON DELETE SET NULL;
