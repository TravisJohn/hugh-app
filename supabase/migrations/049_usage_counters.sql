-- ── 049: usage_counters — make the budget check atomic, and add a rate limit ──
--
-- Release blocker #5 from DEPLOYMENT_READINESS_AUDIT.md.
--
-- The defect this closes: `checkUsageAllowed` summed every `usage_logs` row for
-- the month, returned "allowed", and only AFTER the model replied did
-- `logUsage` insert the row. Between the read and the write there was no lock
-- and no reservation, so N concurrent requests all read the same pre-spend
-- total and all passed. A learner sitting at 99k of a 100k cap could fire
-- twenty parallel requests and every one of them was authorised.
--
-- The fix is a reservation, not a better read. A request claims its estimated
-- cost BEFORE the call, so the losing side of a race sees the winner's claim
-- already counted.
--
-- Why the arithmetic is here and not in TypeScript: atomicity is the entire
-- point, and only the database can compare-and-increment under a row lock.
-- What is NOT here is the policy — the limit, the estimate and the windows are
-- computed in `lib/tokenBudget.ts` (pure, unit-tested) and passed in as
-- numbers. The comparison rule therefore exists once, in SQL; the plan rules
-- exist once, in TypeScript; and neither can drift from a copy of itself.
--
-- Also note what this deletes: the per-request read stops being O(rows this
-- month) and becomes a single indexed row. The gate gets FASTER, most for the
-- heaviest users, whose monthly row count was largest.

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The window usage is counted over — normally the first of the month, but an
  -- admin reset mid-month wins. Computed by `periodStart()` in
  -- `lib/tokenBudget.ts` and passed in, so the gate and the header gauge cannot
  -- disagree about when the month started. Part of the key, so a new period
  -- starts a fresh counter without anything having to delete the old one.
  period_start         TIMESTAMPTZ NOT NULL,

  -- Tokens actually spent this period. Seeded from `usage_logs` on first touch
  -- and incremented by `record_usage` thereafter, so it tracks the same truth
  -- the admin cost view reads — a running total, not a second opinion.
  --
  -- BIGINT, not INTEGER: a pro account at 1M tokens a month comes within range
  -- of INTEGER's 2.1bn ceiling in a few years of heavy use, and a counter that
  -- overflows fails in the dangerous direction.
  tokens_spent         BIGINT      NOT NULL DEFAULT 0,

  -- Tokens claimed by requests that are in flight and have not yet logged.
  --
  -- Kept SEPARATE from tokens_spent rather than reconciled into it, because a
  -- single gated request can log several times: `POST /api/dashboard/goals`
  -- gates once and then bills `dashboard/refine-topic`, `tracker/generate` and
  -- `tracker/priority`. Any scheme that subtracted an estimate per log row
  -- would under-count by the estimates of the calls it never reserved.
  --
  -- Additive here, subtractive nowhere: reservations are not released, they
  -- EXPIRE (see reserve_window_start). That is what makes a crashed or
  -- timed-out request self-healing — nothing has to run in its failure path to
  -- give the budget back.
  reserved_tokens      BIGINT      NOT NULL DEFAULT 0,
  reserve_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Fixed-window rate limiting, in the same row so it costs no extra round
  -- trip. Fixed rather than sliding: a sliding window needs a row per request,
  -- which reintroduces exactly the O(rows) read this migration exists to
  -- delete. The known looseness is up to 2x the nominal rate across a window
  -- boundary — acceptable when the purpose is stopping a runaway loop.
  rate_window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rate_count           INTEGER     NOT NULL DEFAULT 0,

  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, period_start)
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

-- No policy, deliberately — same stance as operation_events (047). RLS with no
-- policy denies everyone; writes and reads come from the service role, which
-- bypasses it. A learner must never be able to write their own budget counter.


-- ── reserve_usage ────────────────────────────────────────────────────────────
--
-- Claim `p_estimate` tokens and one request slot, atomically. Returns whether
-- the claim was granted and, if not, which of the two ceilings refused it.
--
-- The cap is compared against tokens_spent + reserved_tokens: what is already
-- gone, plus what is currently in the air.
--
-- `p_token_limit` NULL means "not enforced" — the current posture for pro and
-- admin. The rate limit still applies to them: that is abuse protection, not
-- budgeting, and an admin account with a runaway client spends real money at
-- exactly the same rate as anyone else's.
CREATE OR REPLACE FUNCTION reserve_usage(
  p_user_id       UUID,
  p_period_start  TIMESTAMPTZ,
  p_estimate      BIGINT,
  p_token_limit   BIGINT,
  p_max_requests  INTEGER,
  p_rate_window_s INTEGER,
  p_reserve_ttl_s INTEGER,
  p_now           TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (granted BOOLEAN, reason TEXT, tokens_after BIGINT, retry_after INTEGER)
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_row        usage_counters%ROWTYPE;
  v_seed       BIGINT;
  v_reserved   BIGINT;
  v_res_start  TIMESTAMPTZ;
  v_rate_start TIMESTAMPTZ;
  v_rate_count INTEGER;
  v_window_end TIMESTAMPTZ;
BEGIN
  -- First touch of a period seeds from what has already been logged. Without
  -- this, deploying 049 would hand every learner who had already spent this
  -- month a brand new allowance, and the first month after launch would be
  -- effectively uncapped.
  SELECT COALESCE(SUM(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)), 0)
    INTO v_seed
    FROM usage_logs
   WHERE user_id = p_user_id
     AND created_at >= p_period_start;

  INSERT INTO usage_counters (
    user_id, period_start, tokens_spent, reserved_tokens, reserve_window_start,
    rate_window_start, rate_count
  )
  VALUES (p_user_id, p_period_start, v_seed, 0, p_now, p_now, 0)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- FOR UPDATE is what makes this a reservation rather than another racy read.
  -- Concurrent callers serialise here, so the second one sees the first one's
  -- claim already counted.
  SELECT * INTO v_row
    FROM usage_counters
   WHERE user_id = p_user_id AND period_start = p_period_start
     FOR UPDATE;

  -- Expire in-flight reservations wholesale once the window has passed. By then
  -- every request that made them has either logged its real spend into
  -- tokens_spent or died, so keeping them would double-count.
  v_reserved  := v_row.reserved_tokens;
  v_res_start := v_row.reserve_window_start;
  IF p_now >= v_res_start + make_interval(secs => p_reserve_ttl_s) THEN
    v_reserved  := 0;
    v_res_start := p_now;
  END IF;

  -- Roll the rate window if it has expired.
  v_rate_start := v_row.rate_window_start;
  v_rate_count := v_row.rate_count;
  v_window_end := v_rate_start + make_interval(secs => p_rate_window_s);
  IF p_now >= v_window_end THEN
    v_rate_start := p_now;
    v_rate_count := 0;
    v_window_end := p_now + make_interval(secs => p_rate_window_s);
  END IF;

  -- Rate ceiling first: it is the cheaper refusal and the one that protects
  -- against a loop. A refused request still burns its request slot, so
  -- hammering the refusal does not reset anything.
  IF v_rate_count >= p_max_requests THEN
    UPDATE usage_counters
       SET reserved_tokens      = v_reserved,
           reserve_window_start = v_res_start,
           rate_window_start    = v_rate_start,
           rate_count           = v_rate_count + 1,
           updated_at           = p_now
     WHERE user_id = p_user_id AND period_start = p_period_start;

    RETURN QUERY SELECT
      FALSE,
      'rate_limited'::TEXT,
      v_row.tokens_spent,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_window_end - p_now)))::INTEGER);
    RETURN;
  END IF;

  -- Token ceiling: spent, plus in-flight, plus this request's claim.
  IF p_token_limit IS NOT NULL
     AND v_row.tokens_spent + v_reserved + p_estimate > p_token_limit THEN
    -- The request will not run, so nothing is reserved for it — but the
    -- request slot is still consumed, for the same reason as above.
    UPDATE usage_counters
       SET reserved_tokens      = v_reserved,
           reserve_window_start = v_res_start,
           rate_window_start    = v_rate_start,
           rate_count           = v_rate_count + 1,
           updated_at           = p_now
     WHERE user_id = p_user_id AND period_start = p_period_start;

    RETURN QUERY SELECT FALSE, 'limit_reached'::TEXT, v_row.tokens_spent, NULL::INTEGER;
    RETURN;
  END IF;

  UPDATE usage_counters
     SET reserved_tokens      = v_reserved + p_estimate,
         reserve_window_start = v_res_start,
         rate_window_start    = v_rate_start,
         rate_count           = v_rate_count + 1,
         updated_at           = p_now
   WHERE user_id = p_user_id AND period_start = p_period_start;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_row.tokens_spent, NULL::INTEGER;
END;
$fn$;


-- ── record_usage ─────────────────────────────────────────────────────────────
--
-- Add one call's real token spend to the running total.
--
-- Purely additive, and deliberately unaware of what was reserved. That is what
-- lets a single gated request log several times — the goals route bills three
-- separate features off one gate — without any of them having to know which
-- reservation it belongs to. The reservation is not cancelled here; it expires
-- on its own window inside reserve_usage.
--
-- No-ops when the counter row does not exist yet. That happens only for spend
-- that never passed a gate, and reserve_usage will pick it up when it next
-- seeds the period from usage_logs.
CREATE OR REPLACE FUNCTION record_usage(
  p_user_id      UUID,
  p_period_start TIMESTAMPTZ,
  p_tokens       BIGINT
)
RETURNS VOID
LANGUAGE SQL
SET search_path = public, pg_catalog
AS $fn$
  UPDATE usage_counters
     SET tokens_spent = tokens_spent + GREATEST(0, p_tokens),
         updated_at   = NOW()
   WHERE user_id = p_user_id AND period_start = p_period_start;
$fn$;
