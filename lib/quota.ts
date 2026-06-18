import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const FREE_SESSION_LIMIT = 5;

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: "free" | "pro";
}

/**
 * Returns how many sessions the user has started in the current calendar month
 * and whether they are allowed to start another one.
 * Pro users are always allowed; free users are capped at FREE_SESSION_LIMIT.
 */
export async function checkSessionQuota(
  supabase: SupabaseServerClient,
  userId: string
): Promise<QuotaResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .single();

  const plan = (profile?.plan ?? "free") as "free" | "pro";

  if (plan === "pro") {
    return { allowed: true, used: 0, limit: FREE_SESSION_LIMIT, plan: "pro" };
  }

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("started_at", start.toISOString());

  const used = count ?? 0;

  return {
    allowed: used < FREE_SESSION_LIMIT,
    used,
    limit: FREE_SESSION_LIMIT,
    plan: "free",
  };
}
