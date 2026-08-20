import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { MarginNote, MarginSurface } from "@/types/margin";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Read one margin note during a server render.
 *
 * The service page is already a server component that loads its write-up, so
 * the pad arrives populated rather than flashing empty and filling in — on a
 * page whose whole promise is a fast, zero-AI reference, a spinner in the rail
 * would be the slowest thing on screen.
 *
 * Scoped by RLS rather than an explicit user filter: this runs on the learner's
 * own session client, and `learner_notes_owner_all` (migration 045) already
 * restricts every row to its owner. A missing note is a normal state, not an
 * error — most services will never have one.
 */
export async function loadMarginNote(
  supabase: ServerClient,
  surface: MarginSurface,
  refId: string,
): Promise<MarginNote | null> {
  const { data, error } = await supabase
    .from("learner_notes").select("*")
    .eq("surface", surface).eq("ref_id", refId)
    .maybeSingle();

  if (error) {
    // Never block the write-up on the margin. The page is worth reading even
    // if the pad can't be pre-filled; the pad reports its own save failures.
    console.error("[margin] server read failed:", error);
    return null;
  }
  return (data as MarginNote | null) ?? null;
}
