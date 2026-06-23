-- ── Agentic backlog priority ────────────────────────────────────────────────
-- Replaces the deterministic build-order rank with one Claude reasons through at
-- generation time (dependency-aware). Written ONCE when the track is generated;
-- never recomputed as cards move or get added.
--   priority_rank   — 1-based study order (1 = learn first); null for non-backlog / pre-existing
--   priority_reason — one line on why this comes before/after the others (badge tooltip)
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS priority_rank   INTEGER,
  ADD COLUMN IF NOT EXISTS priority_reason TEXT;
