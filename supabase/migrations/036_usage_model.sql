-- ── 036: record which model served each usage log row ──────────────────────
--
-- Hugh routes deliberately mix models (see CLAUDE.md "Model Selection"):
-- Sonnet for reasoning-heavy work, Haiku for classification and short
-- generation, plus gpt-4o / gpt-4o-mini for the Notes Coach. Their input rates
-- span $0.15–$3.00 per MTok, so a cost estimate that assumes one blended rate
-- is wrong for most rows — it priced every Haiku call at 3x its real cost.
--
-- Nullable on purpose: rows written before this migration have no model, and
-- TTS-only rows never have one. lib/pricing.ts falls back to the most expensive
-- Claude rate for both, so unknown spend is over-stated rather than hidden.

ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS model TEXT;

COMMENT ON COLUMN usage_logs.model IS
  'Model ID that served this call (e.g. claude-haiku-4-5). NULL for TTS-only rows and for rows written before migration 036.';

-- Supports the admin cost breakdown ("spend by model, this month").
CREATE INDEX IF NOT EXISTS usage_logs_model_created
  ON usage_logs (model, created_at DESC);
