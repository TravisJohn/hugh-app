import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { safeInternalPath } from "@/utils/safe-redirect";

// Email-confirmation landing route. Supabase's confirmation email links here.
// Handles both the PKCE (`code`) and token-hash (`token_hash` + `type`) flows so
// it works whether or not the email template is customised. On success the user's
// session is established and their profile is auto-approved — email verification
// IS the access gate now. The admin board keeps `is_blocked` control for abuse
// (e.g. excessive token usage), which this never touches.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next        = safeInternalPath(searchParams.get("next"));
  const code        = searchParams.get("code");
  const token_hash  = searchParams.get("token_hash");
  const type        = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let userId: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) userId = data.user.id;
  } else if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error && data.user) userId = data.user.id;
  }

  if (userId) {
    // Auto-approve on verify. Non-fatal if it fails — the account is confirmed
    // and an admin can still approve manually from the admin board.
    try {
      await createServiceClient()
        .from("profiles")
        .update({ approved: true })
        .eq("user_id", userId);
    } catch {
      /* swallow — verification already succeeded */
    }
    redirect(next);
  }

  redirect("/login?error=confirm");
}
