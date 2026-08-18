import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isKnownModel } from "@/lib/pricing";

// Pricing lives in lib/pricing.ts (pure, unit-tested). Re-exported here so the
// many existing `from "@/lib/usage"` importers keep working.
export { estimateCost, totalCost, MODEL_RATES, rateFor } from "@/lib/pricing";
export type { ModelRate, PricedUsageRow } from "@/lib/pricing";

// Sentinel userId used by the interview routes in local dev — not a real
// auth.users row, so usage rows are never written for it.
const DEV_BYPASS_USER_ID = "dev-test-bypass";

// Free users get 100k combined tokens per calendar month (enforced).
export const DEFAULT_MONTHLY_TOKEN_LIMIT = 100_000;

// Pro/admin monthly token allowance. Shown on the usage gauge for awareness;
// currently display-only (we don't hard-block paying users in checkUsageAllowed).
export const PRO_MONTHLY_TOKEN_LIMIT = 1_000_000;

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Record one billable call. `model` is required for any call that spent tokens
 * so the row can be priced at that model's real rate (migration 036); TTS-only
 * rows legitimately omit it.
 */
export async function logUsage({
  userId,
  feature,
  model,
  tokensIn  = 0,
  tokensOut = 0,
  ttsChars  = 0,
}: {
  userId:     string;
  feature:    string;
  model?:     string;
  tokensIn?:  number;
  tokensOut?: number;
  ttsChars?:  number;
}): Promise<void> {
  if (!tokensIn && !tokensOut && !ttsChars) return;

  // A token-spending row with no known model would be priced at the fallback
  // rate, silently mis-stating spend. Surface it in dev rather than swallow it.
  if (process.env.NODE_ENV !== "production" && (tokensIn || tokensOut) && !isKnownModel(model)) {
    console.warn(
      `[usage] "${feature}" logged ${tokensIn + tokensOut} tokens with ` +
      `${model ? `unrecognised model "${model}"` : "no model"} — cost will fall back to Sonnet rates. ` +
      `Add it to MODEL_RATES in lib/pricing.ts.`
    );
  }

  // The interview routes use a sentinel userId in local dev. It isn't a real
  // auth.users row, so the insert would fail the FK — skip it rather than
  // emit a misleading error on every dev request.
  if (userId === DEV_BYPASS_USER_ID) return;

  const supabase = createServiceClient();
  const { error } = await supabase.from("usage_logs").insert({
    user_id:    userId,
    feature,
    model:      model ?? null,
    tokens_in:  tokensIn,
    tokens_out: tokensOut,
    tts_chars:  ttsChars,
  });

  // Callers `void` this promise, so a rejected insert would vanish entirely and
  // the spend would go unrecorded with nothing to show for it. Logging is the
  // right level of handling: usage accounting must never fail a user request.
  if (error) {
    console.error(`[usage] failed to log "${feature}" for ${userId}:`, error.message);
  }
}

export async function checkUsageAllowed(
  userId: string
): Promise<{ allowed: boolean; reason?: "blocked" | "limit_reached" }> {
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, is_admin, is_blocked, approved, token_limit, usage_reset_at")
    .eq("user_id", userId)
    .single();

  if (profile?.is_blocked)                     return { allowed: false, reason: "blocked" };
  if (!profile?.approved && !profile?.is_admin) return { allowed: false, reason: "blocked" };
  if (profile?.is_admin || profile?.plan === "pro") return { allowed: true };

  // Free user — enforce monthly token budget
  const monthStart     = startOfMonth();
  const resetAt        = profile?.usage_reset_at ?? null;
  const effectiveStart = resetAt && resetAt > monthStart ? resetAt : monthStart;

  const { data: logs } = await supabase
    .from("usage_logs")
    .select("tokens_in, tokens_out")
    .eq("user_id", userId)
    .gte("created_at", effectiveStart);

  const total = (logs ?? []).reduce(
    (sum, r) => sum + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0
  );
  const limit = profile?.token_limit ?? DEFAULT_MONTHLY_TOKEN_LIMIT;

  if (total >= limit) return { allowed: false, reason: "limit_reached" };
  return { allowed: true };
}

/**
 * Route-handler gate for every billable AI/TTS endpoint (HIGH-03/HIGH-05 —
 * deployment readiness audit). Wraps `checkUsageAllowed` (which already
 * covers `is_blocked`/`approved` as well as the token budget) into the
 * 403/429 JSON response every route should return on rejection, so each
 * handler doesn't hand-roll its own copy of this logic.
 *
 * Usage:
 *   const gate = await enforceUsageGate(userId);
 *   if (gate) return gate;
 */
export async function enforceUsageGate(userId: string): Promise<NextResponse | null> {
  const { allowed, reason } = await checkUsageAllowed(userId);
  if (allowed) return null;

  const msg = reason === "limit_reached"
    ? "Monthly usage limit reached."
    : "Your access has been restricted.";
  return NextResponse.json({ error: msg }, { status: reason === "limit_reached" ? 429 : 403 });
}

export interface UsageSummary {
  tokens: { used: number; limit: number; pct: number };
}

/**
 * Monthly token consumption for the header gauge. Everyone has an allowance:
 * free uses the enforced cap; pro/admin get the larger (display-only) allowance.
 * Mirrors checkUsageAllowed's month/reset window so the figure stays consistent
 * with what enforcement actually counts.
 */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, is_admin, token_limit, usage_reset_at")
    .eq("user_id", userId)
    .single();

  const monthStart     = startOfMonth();
  const resetAt        = profile?.usage_reset_at ?? null;
  const effectiveStart = resetAt && resetAt > monthStart ? resetAt : monthStart;

  const { data: logs } = await supabase
    .from("usage_logs")
    .select("tokens_in, tokens_out")
    .eq("user_id", userId)
    .gte("created_at", effectiveStart);

  const used       = (logs ?? []).reduce((s, r) => s + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0);
  const isUpgraded = Boolean(profile?.is_admin) || profile?.plan === "pro";
  const limit      = isUpgraded
    ? PRO_MONTHLY_TOKEN_LIMIT
    : (profile?.token_limit ?? DEFAULT_MONTHLY_TOKEN_LIMIT);
  const pct        = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return { tokens: { used, limit, pct } };
}
