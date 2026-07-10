import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import NotesWorkspace from "@/components/notes/NotesWorkspace";

// The Notes workspace — capture a test screenshot + your reasoning, then let
// Hugh (the Coach) read both and correct your thinking. Auth-gated like the rest
// of the post-login app; all per-user data is fetched client-side by useNotes
// through the /api/notes/* routes.
export default async function NotesPage() {
  const supabase = await createClient();
  await verifyUserAccess(supabase);

  return <NotesWorkspace />;
}
