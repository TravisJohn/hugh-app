import { type NextRequest } from "next/server";
import { createClient } from "./server";

/**
 * Returns the authenticated user's ID, or null if not authenticated.
 *
 * Dev bypass: in non-production environments, passing
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 * is accepted so API routes can be tested without a browser session.
 * This branch is compiled away in production builds.
 */
export async function getAuthenticatedUserId(
  request: NextRequest
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return user.id;

  if (process.env.NODE_ENV !== "production") {
    const authHeader = request.headers.get("Authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && authHeader === `Bearer ${serviceKey}`) {
      return "dev-test-bypass";
    }
  }

  return null;
}
