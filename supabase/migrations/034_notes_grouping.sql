-- ── Notes v2: free-form grouping, the Bag, and multi-snip buckets ───────────
-- Three independent capabilities, one migration because they all reshape the
-- Notes tree at once:
--
--   1. GROUPING  — notebooks nest inside notebooks, pages nest inside pages,
--                  to any depth. A "group" is a row in the SAME table with
--                  is_group = true: it holds children but no content of its
--                  own. Keeping groups in the existing tables (rather than a
--                  separate note_groups table) is what lets a group and a
--                  notebook be *siblings in one ordered list* — drag-reorder
--                  interleaves the two kinds, which a two-table model can't do
--                  without sorting across tables.
--
--   2. THE BAG   — bagged_at IS NOT NULL means "tucked away": hidden from the
--                  tree, listed in the Bag drawer, restorable in place. A
--                  timestamp rather than a boolean so the drawer can sort by
--                  most-recently-bagged for free.
--
--   3. MULTI-SNIP BUCKETS — a tall question often needs two or three snips to
--                  capture. Until now each snip was its own screenshot with its
--                  own thread, so the Coach never saw the bottom half while
--                  commenting on the top. Now extra snips attach to the first
--                  one via parent_image_id: the parent row remains "the
--                  screenshot" (it keeps the title, the flag and the whole
--                  thread), and its children are just more image bytes stacked
--                  under it in order. Nothing keyed on note_messages.image_id
--                  changes, so no data migration is needed.
--
-- Invariants enforced in /api/notes/* (single writer path, service-role), not
-- declaratively — each needs a recursive walk or a trigger, and the API is the
-- only thing that ever writes these tables:
--   • A page's notebook_id NEVER changes, however it is regrouped. Pages are
--     bounded by their notebook (see CLAUDE.md).
--   • parent_id may only point at a row with is_group = true. Real notebooks
--     and real pages are leaves-with-content, never containers.
--   • No cycles: a container can't be moved inside its own descendant.
--   • note_images nest exactly one level — a part never has parts of its own.

-- ── 1. Notebooks: nesting + the Bag ─────────────────────────────────────────
-- ON DELETE CASCADE is the safety net, not the normal path: dissolving a group
-- lifts its children up one level BEFORE the container row is deleted, so the
-- cascade only ever fires if a subtree is deleted deliberately.
ALTER TABLE notebooks
  ADD COLUMN IF NOT EXISTS parent_id  UUID        REFERENCES notebooks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_group   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bagged_at  TIMESTAMPTZ;

-- Siblings are ordered within a parent, so the tree query and every reorder
-- read the same (owner, parent, position) path.
CREATE INDEX IF NOT EXISTS notebooks_parent_idx ON notebooks (user_id, parent_id, position);

-- ── 2. Pages: nesting + the Bag ─────────────────────────────────────────────
-- Same shape as notebooks, but every descendant keeps its notebook_id, so a
-- page group is always wholly inside one notebook.
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS parent_id  UUID        REFERENCES notes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_group   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bagged_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notes_parent_idx ON notes (notebook_id, parent_id, position);

-- ── 3. Screenshots: multi-snip buckets ──────────────────────────────────────
-- parent_image_id NULL  → this row IS a bucket (has title, flag, thread).
-- parent_image_id SET   → an extra snip stacked under that bucket, ordered by
--                         `position`. Its own title/flag are unused.
ALTER TABLE note_images
  ADD COLUMN IF NOT EXISTS parent_image_id UUID REFERENCES note_images(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS position        INT  NOT NULL DEFAULT 0;

-- Partial index: only parts are ever looked up by parent, and they are a small
-- minority of rows, so this stays tiny.
CREATE INDEX IF NOT EXISTS note_images_parent_idx
  ON note_images (parent_image_id, position)
  WHERE parent_image_id IS NOT NULL;

-- Backfill ordering for screenshots that predate `position`: they were listed
-- by created_at, so seed position from that order to keep the strip stable.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY note_id ORDER BY created_at) - 1 AS seq
  FROM note_images
  WHERE parent_image_id IS NULL
)
UPDATE note_images i
SET    position = o.seq
FROM   ordered o
WHERE  i.id = o.id AND i.position = 0;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- No new tables, so the owner-only policies from 027_notes.sql already cover
-- every row touched here. Nothing to add.
