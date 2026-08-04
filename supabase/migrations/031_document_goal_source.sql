-- Document-upload course path (PRD-course-from-document.md §7.2).
--
-- source_kind tags where a goal's topic came from: 'qa' (the existing
-- Socratic refinement loop) or 'document' (uploaded PDF/DOCX/HTML).
--
-- track_status gains 'awaiting_approval': the document path's `extract`
-- route creates the goal here and returns the candidate topic/tips for
-- review, instead of firing background generation immediately like the
-- Q&A path does. The `approve` route flips it to 'pending' once the
-- learner confirms, and generation proceeds exactly as it does today.
ALTER TABLE learning_goals DROP CONSTRAINT IF EXISTS learning_goals_track_status_check;
ALTER TABLE learning_goals
  ADD CONSTRAINT learning_goals_track_status_check
    CHECK (track_status IN ('pending', 'ready', 'failed', 'awaiting_approval'));

ALTER TABLE learning_goals
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'qa'
    CHECK (source_kind IN ('qa', 'document'));

-- Extracted document text lives here only for the window between `extract`
-- and `approve`. The `approve` route's after() callback deletes this row
-- once generateTrack has read it, so source text doesn't linger once the
-- track is built. The raw uploaded file itself is never persisted anywhere —
-- extraction happens in-request and the buffer is discarded.
CREATE TABLE IF NOT EXISTS pending_document_extractions (
  goal_id        UUID        PRIMARY KEY REFERENCES learning_goals(id) ON DELETE CASCADE,
  extracted_text TEXT        NOT NULL,
  tips           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  source_format  TEXT        NOT NULL CHECK (source_format IN ('pdf', 'docx', 'html')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_document_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_document_extractions_owner" ON pending_document_extractions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM learning_goals
      WHERE learning_goals.id = pending_document_extractions.goal_id
        AND learning_goals.user_id = auth.uid()
    )
  );
