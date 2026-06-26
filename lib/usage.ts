import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Free users get 100k combined tokens per calendar month (enforced).
export const DEFAULT_MONTHLY_TOKEN_LIMIT = 100_000;

// Pro/admin monthly token allowance. Shown on the usage gauge for awareness;
// currently display-only (we don't hard-block paying users in checkUsageAllowed).
export const PRO_MONTHLY_TOKEN_LIMIT = 1_000_000;

// Approximate cost constants (USD)
const COST_PER_INPUT_TOKEN  = 3    / 1_000_000; // claude-sonnet-4-6 input
const COST_PER_OUTPUT_TOKEN = 15   / 1_000_000; // claude-sonnet-4-6 output
const COST_PER_TTS_CHAR     = 0.30 / 1_000;     // ElevenLabs ~Creator plan

export function estimateCost(tokensIn: number, tokensOut: number, ttsChars: number): number {
  return (tokensIn * COST_PER_INPUT_TOKEN) + (tokensOut * COST_PER_OUTPUT_TOKEN) + (ttsChars * COST_PER_TTS_CHAR);
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function logUsage({
  userId,
  feature,
  tokensIn  = 0,
  tokensOut = 0,
  ttsChars  = 0,
}: {
  userId:     string;
  feature:    string;
  tokensIn?:  number;
  tokensOut?: number;
  ttsChars?:  number;
}): Promise<void> {
  if (!tokensIn && !tokensOut && !ttsChars) return;
  const supabase = createServiceClient();
  await supabase.from("usage_logs").insert({
    user_id:    userId,
    feature,
    tokens_in:  tokensIn,
    tokens_out: tokensOut,
    tts_chars:  ttsChars,
  });
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
