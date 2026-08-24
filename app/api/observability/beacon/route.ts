import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { recordOperation } from "@/lib/observability/record";
import { CLIENT_REPORTABLE_IDS, isOperationId, type OperationId } from "@/lib/observability/operations";

// ── The browser beacon ──────────────────────────────────────────────────────
//
// The one signal only the client can see: a background build that died without
// ever writing a status. `after()` can be killed mid-flight, and a killed
// invocation cannot report its own death — so the browser's watchdog timeout
// in useTrackStatusWatch is the sole evidence the attempt existed.
//
// This is a client-writable path into a system table, so it is a fixed-shape
// signal rather than a logging endpoint. Everything that could carry free text
// is either hardcoded here or rejected:
//
//   operation   must be in the registry's clientReportable allowlist
//   outcome     hardcoded 'failed' - never read from the request
//   errorClass  hardcoded 'client-timeout' - never read from the request
//   detail      one number, clamped. No strings are accepted at all.
//
// The goal is also checked against the caller, so a learner cannot report
// timeouts for somebody else's build.

/** Hardcoded, never taken from the body. A beacon reports one thing. */
const BEACON_ERROR_CLASS = "client-timeout";

/** A watchdog longer than this is a stuck tab, not a measurement worth storing. */
const MAX_WAITED_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { operation, goalId, waitedMs } = (body ?? {}) as {
    operation?: unknown;
    goalId?:    unknown;
    waitedMs?:  unknown;
  };

  // The allowlist is what makes the registry's `clientReportable` flag
  // load-bearing rather than decorative. Widening it widens what a browser can
  // put in the database, which is why it is checked and not defaulted.
  if (
    !isOperationId(operation) ||
    !(CLIENT_REPORTABLE_IDS as readonly string[]).includes(operation)
  ) {
    return NextResponse.json({ error: "Operation is not client-reportable." }, { status: 400 });
  }

  if (typeof goalId !== "string" || !goalId) {
    return NextResponse.json({ error: "goalId is required" }, { status: 400 });
  }

  // Ownership. Without this, any authenticated learner could file failures
  // against any goal in the system and poison the panel.
  const supabase = await createClient();
  const { data: goal } = await supabase
    .from("learning_goals")
    .select("id")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Goal not found." }, { status: 404 });

  // The only caller-supplied value that survives, and it cannot carry text.
  const waited =
    typeof waitedMs === "number" && Number.isFinite(waitedMs) && waitedMs >= 0
      ? Math.min(Math.round(waitedMs), MAX_WAITED_MS)
      : null;

  await recordOperation({
    userId,
    operation:  operation as OperationId,
    outcome:    "failed",
    durationMs: waited ?? undefined,
    // A plain Error, so error_class resolves through the same path every
    // server-side failure uses. Its message is a constant, never learner text.
    error:      Object.assign(new Error("Build never reported a status"), {
      name: BEACON_ERROR_CLASS,
    }),
    detail:     { reportedBy: "beacon" },
  });

  return NextResponse.json({ ok: true });
}
