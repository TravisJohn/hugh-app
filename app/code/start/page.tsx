import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import CodeLanding from "@/components/code/CodeLanding";

// The Code pillar landing — a picker of curated practice packs (see CodeLanding).
// Auth-gated like the rest of the post-login app; the pack content is static, so
// there's no per-user data to fetch here.
export default async function CodeStartPage() {
  const supabase = await createClient();
  await verifyUserAccess(supabase);

  return <CodeLanding />;
}
