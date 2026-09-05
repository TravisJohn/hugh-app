import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteAccount } from "@/lib/account/deleteAccount";
import { logSafeError } from "@/lib/observability/log";

// Self-serve account deletion. The learner deletes their own account and
// everything owned by it; the admin console can action the same thing for
// someone who has lost access (app/api/admin/users/[userId]).
//
// Both paths call one routine (lib/account/deleteAccount.ts) on purpose. Two
// implementations of "delete everything" is how one of them quietly stops
// covering a bucket.

export const maxDuration = 60;

/**
 * The typed-email confirmation is required by the API, not only by the UI.
 * This is irreversible and unauthenticated-by-accident calls are the risk a
 * session cookie alone does not cover — a stray fetch from another tab carries
 * the cookie, but it cannot know the address to type.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null) as { confirm?: unknown } | null;
  const confirm = typeof body?.confirm === "string" ? body.confirm.trim().toLowerCase() : "";

  if (!confirm || confirm !== (user.email ?? "").toLowerCase()) {
    return NextResponse.json(
      { error: "Type your email address exactly to confirm." },
      { status: 400 },
    );
  }

  try {
    const receipt = await deleteAccount(createServiceClient(), user.id);
    // The session is now bound to a user that no longer exists; the client
    // signs out immediately after this returns.
    return NextResponse.json({ ok: true, ...receipt });
  } catch (err) {
    // Deliberately surfaced rather than swallowed: a deletion that reports
    // success without finishing is the one outcome this whole path exists to
    // avoid.
    //
    // The copy does NOT claim nothing was removed, because that may not be
    // true — the storage sweep runs before the account is dropped, so a failure
    // can land with files already gone. What IS true is that the account still
    // exists and a retry finishes the job: the sweep finds nothing the second
    // time and the redaction re-applies the same values.
    logSafeError("account self-deletion", err, [user.email ?? ""]);
    return NextResponse.json(
      {
        error:
          "Your account was not deleted. Some of your uploaded files may already " +
          "have been removed, so it is best to try again and finish — repeating is safe.",
      },
      { status: 500 },
    );
  }
}
