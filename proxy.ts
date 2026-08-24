import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write updated cookies onto the outgoing request so downstream
          // Server Components see the refreshed session, then mirror them
          // onto the response so the browser receives them.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: always call getUser() to refresh the session token — the
  // return value is deliberately unused. Route gating lives in the pages
  // themselves (verifyUserAccess); this proxy exists only so Server
  // Components see a refreshed session, since they cannot set cookies.
  // Never use getSession() here — it reads from the cookie without
  // server-side verification.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on pages only — never /api/*. Route Handlers can set cookies
    // themselves (lib/supabase/server.ts), so they self-refresh the session
    // via their own getUser() call; Server Components can't (cookies().set()
    // throws outside middleware), which is the actual reason this needs to
    // run here at all. Routing every API request through an extra Supabase
    // getUser() round trip was pure duplicated latency (MEDIUM-09).
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
