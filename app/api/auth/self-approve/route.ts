import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Interim open-signup approval. Called by the sign-up flow ONLY on the
// immediate-login path, which happens when Supabase "Confirm email" is OFF.
// When email confirmation is ON, sign-up can't log in immediately, so this is
// never called — approval then flows through /auth/confirm on email verify.
//
// Sets approved=true for the currently authenticated user. Never touches
// is_blocked, so the admin board's abuse control still holds. Once email
// verification is enabled (GCP), this route can be removed.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await createServiceClient()
    .from("profiles")
    .update({ approved: true })
    .eq("user_id", user.id)
    .eq("is_blocked", false); // don't resurrect a blocked account

  if (error) {
    console.error("[self-approve] profile update failed", error);
    return NextResponse.json({ error: "Could not approve account" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
