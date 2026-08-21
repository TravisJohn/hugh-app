import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import CodeLanding from "@/components/code/CodeLanding";
import { PACKS } from "@/lib/code/packs";
import { computeAllPackProgress, buildHeatmap, type DrillAttemptRow } from "@/lib/code/progress";
import { computeAllGroupHeat, computeAllPackHeat, type HeatReading, type PackHeatInput } from "@/lib/code/heat";
import { DRILL_LANGS, type DrillLang } from "@/types/code";

// The Code pillar landing — a picker of curated practice packs (see CodeLanding),
// plus a practice-history summary: a per-pack tier badge (not started / in
// progress / complete / owned / review due) and a no-streak calendar heatmap.
// Both are derived here, server-side, from `code_drill_attempts` — same
// fetch-then-pass-props shape as app/cases/page.tsx reading case_attempts.
// If migration 029 hasn't been applied yet, the select errors and everything
// just renders as "not started" / an empty heatmap — no crash.
export default async function CodeStartPage() {
  const supabase = await createClient();
  const { user } = await verifyUserAccess(supabase);

  const { data, error } = await supabase
    .from("code_drill_attempts")
    .select("pack_id, cell_id, passed, used_ref, created_at")
    .eq("user_id", user.id);

  const attempts: DrillAttemptRow[] = !error && data ? data : [];
  const progress = computeAllPackProgress(
    PACKS.map(p => ({ id: p.id, cellIds: p.content.cells.map(c => c.id) })),
    attempts,
  );
  const heatmap = buildHeatmap(attempts);

  // Practice heat for the pattern map. Group heat is language-scoped (a group
  // cell sits above the leaves of the ACTIVE language only), but the language
  // pill is client state — so every language is computed here and the client
  // picks one. A handful of small records beats shipping every attempt row to
  // the browser and recomputing there. Built from DRILL_LANGS so a new language
  // is covered without editing this file.
  const packInputs: PackHeatInput[] = PACKS.map(p => ({
    id: p.id,
    lang: p.lang,
    repCount: p.content.cells.length,
  }));
  const groupHeat = Object.fromEntries(
    DRILL_LANGS.map(lang => [lang, computeAllGroupHeat(packInputs, attempts, lang)]),
  ) as Record<DrillLang, Record<string, HeatReading>>;

  // Per-pack heat is not language-scoped the way group heat is: a leaf belongs
  // to exactly one language already, so one record covers both pills.
  const packHeat = computeAllPackHeat(packInputs, attempts);

  return (
    <CodeLanding
      progress={progress}
      heatmap={heatmap}
      groupHeat={groupHeat}
      packHeat={packHeat}
    />
  );
}
