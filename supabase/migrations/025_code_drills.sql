-- ── Code drills: cache of generated notebook drills ──────────────────────────
-- Generating a drill from a topic is an LLM call (~3–6s + cost). Drills are
-- generic — keyed by WHAT you're practising, not who you are — and getting the
-- same drill back on a revisit is desirable for muscle memory. So we cache the
-- generated DrillContent and reuse it across visits and users.
--
-- The /api/code/generate-drill route reads/writes this via the service-role
-- client only, and treats every cache op as best-effort: if this table is
-- missing or a query fails, it falls back to live generation. That means the
-- feature degrades gracefully if this migration hasn't been applied yet.
CREATE TABLE IF NOT EXISTS code_drills (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key   TEXT        NOT NULL UNIQUE,  -- sha256 of prompt_version + normalized topic/context/focus
  topic       TEXT        NOT NULL,
  context     TEXT,
  focus       TEXT,
  content     JSONB       NOT NULL,         -- the DrillContent { scenario, cells }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS on, no policies: only the service-role client (which bypasses RLS) touches
-- this table. Anon/authenticated clients are denied by default — the cache is
-- never read or written from the browser.
ALTER TABLE code_drills ENABLE ROW LEVEL SECURITY;
