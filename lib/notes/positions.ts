import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Next free `position` value for a new row within an owner/parent scope, so new
// notebooks and notes append to the end of the tree rather than jumping around.
export async function nextPosition(
  db: SupabaseClient,
  table: "notebooks" | "notes",
  match: Record<string, string>,
): Promise<number> {
  const { data } = await db
    .from(table)
    .select("position")
    .match(match)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const top = (data as { position?: number } | null)?.position;
  return typeof top === "number" ? top + 1 : 0;
}
