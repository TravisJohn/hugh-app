-- ── CRITICAL-01 fix (deployment readiness audit, 2026-08-04) ────────────────
-- `profiles_owner` (007_profiles.sql) is FOR ALL USING (auth.uid() = user_id)
-- WITH CHECK (auth.uid() = user_id). Later migrations (013, 014) added
-- privilege-bearing columns — is_admin, approved, is_blocked, token_limit,
-- usage_reset_at — without ever narrowing that policy. Since the Supabase
-- anon key is public by design, any authenticated user can currently call
-- the REST API directly and set is_admin=true / approved=true / plan='pro'
-- on their own row.
--
-- Every legitimate write to `profiles` in the app already goes through the
-- server-only service-role client (lib/supabase/service.ts), which bypasses
-- RLS entirely — see app/api/admin/users/[userId]/route.ts,
-- app/api/auth/self-approve/route.ts, and app/auth/confirm/route.ts. The
-- signup trigger (handle_new_user, 007_profiles.sql) is SECURITY DEFINER and
-- is unaffected by grants on the `authenticated` role. So dropping normal
-- users' write access here has no legitimate feature to replace.
--
-- BEFORE APPLYING IN PRODUCTION: check existing profile rows for values an
-- attacker may already have set via this hole (is_admin, approved,
-- is_blocked, plan, token_limit) — see the audit's CRITICAL-01 remediation.

DROP POLICY IF EXISTS "profiles_owner" ON public.profiles;

CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
