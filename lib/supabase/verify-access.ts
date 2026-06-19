import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifies the current user is authenticated, approved, and not blocked.
 * Redirects to /login, /pending, or /blocked automatically.
 * Returns { user, profile } when all checks pass.
 */
export async function verifyUserAccess(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, is_admin, is_blocked, approved")
    .eq("user_id", user.id)
    .single();

  if (profile?.is_blocked)                      redirect("/blocked");
  if (!profile?.approved && !profile?.is_admin) redirect("/pending");

  return { user, profile };
}
