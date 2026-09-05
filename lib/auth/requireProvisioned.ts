import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logSafeError } from "@/lib/observability/log";
import {
  isProvisioned,
  PROVISIONING_COLUMNS,
  type ProvisionedSurface,
  type ProvisioningFlags,
} from "@/lib/auth/provisioning";

/**
 * Server-side reads for the surface provisioning added in migration 050.
 * Arranged like `requireAdmin.ts`: one status read, a page form and an API form.
 *
 * Why this exists on top of RLS. The API routes use the service-role client,
 * which bypasses RLS entirely and enforces ownership by hand — so the database
 * policies added in 050 do not protect those routes at all. 050 stops the
 * browser reaching Storage and the tables *directly* with its own session;
 * this stops our own API doing it on request. Both halves are needed, and
 * neither substitutes for the other.
 */

/**
 * Read both flags for an account.
 *
 * Returns `null` on any failure — including the case that will really happen,
 * a deploy that lands before migration 050 is applied by hand, where selecting
 * the columns errors because they do not exist yet. `isProvisioned` reads null
 * as "not provisioned", so the surfaces stay closed until the migration is in.
 * The error is logged rather than swallowed: a permanent silent `false` here
 * would look exactly like a deliberate policy.
 */
export async function readProvisioning(userId: string): Promise<ProvisioningFlags | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(PROVISIONING_COLUMNS)
      .eq("user_id", userId)
      .single();

    if (error) {
      logSafeError("provisioning read", error, []);
      return null;
    }
    return data as ProvisioningFlags;
  } catch (err) {
    logSafeError("provisioning read threw", err, []);
    return null;
  }
}

/** Convenience for server components deciding whether to render a surface. */
export async function hasSurface(
  userId:  string,
  surface: ProvisionedSurface,
): Promise<boolean> {
  return isProvisioned(await readProvisioning(userId), surface);
}

/**
 * Route-handler gate. Returns a 403 the caller should return directly, or
 * `null` when the account may proceed:
 *
 *   const denied = await requireProvisionedApi(userId, "notes");
 *   if (denied) return denied;
 *
 * 403 rather than 404: the learner is authenticated and the route exists — it
 * is not available to them. Rule 5 — the refusal says which of those it is.
 */
export async function requireProvisionedApi(
  userId:  string,
  surface: ProvisionedSurface,
): Promise<NextResponse | null> {
  if (await hasSurface(userId, surface)) return null;

  return NextResponse.json(
    { error: "This part of Hugh is not available on your account yet." },
    { status: 403 },
  );
}
