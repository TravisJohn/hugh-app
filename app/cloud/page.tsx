import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import { loadCloudManifest } from "@/lib/cloud/loader";
import CloudLanding from "@/components/cloud/CloudLanding";

// The Cloud Skills library. Auth-gated like the rest of the learner area. Reads
// only the manifest (lightweight stubs); each service's full write-up loads on
// its own page. Zero runtime AI on this screen.
export default async function CloudPage() {
  const supabase = await createClient();
  await verifyUserAccess(supabase);
  const manifest = await loadCloudManifest();

  return <CloudLanding manifest={manifest} />;
}
