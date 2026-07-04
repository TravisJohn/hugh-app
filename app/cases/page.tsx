import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import { loadManifest } from "@/lib/cases/loader";
import CaseLanding from "@/components/cases/CaseLanding";
import type { CaseProgress } from "@/types/cases";

// The Case Room library. Auth-gated like the rest of the learner area. Reads
// only the manifest (lazy — full cases load on their own page) plus this
// learner's attempts, rolled up per case for the completion badges.
export default async function CasesPage() {
  const supabase = await createClient();
  const { user } = await verifyUserAccess(supabase);
  const manifest = await loadManifest();

  // Roll up attempts → per-case progress. Tolerant of the migration not being
  // applied yet: if the table is missing, progress is simply empty.
  const { data, error } = await supabase
    .from("case_attempts")
    .select("case_id, held_count")
    .eq("user_id", user.id);

  const progress: Record<string, CaseProgress> = {};
  if (!error && data) {
    for (const row of data as { case_id: string; held_count: number }[]) {
      const p = progress[row.case_id] ?? { completed: false, bestHeld: 0, attempts: 0 };
      p.completed = true;
      p.attempts += 1;
      p.bestHeld = Math.max(p.bestHeld, row.held_count ?? 0);
      progress[row.case_id] = p;
    }
  }

  return <CaseLanding manifest={manifest} progress={progress} />;
}
