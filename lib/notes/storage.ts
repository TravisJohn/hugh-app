import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Private Storage bucket holding note screenshots. Objects are keyed
// `<user_id>/<note_id>/<uuid>.<ext>` so RLS (and this code) can scope by owner.
export const NOTE_IMAGES_BUCKET = "note-images";

// How long a signed image URL stays valid (seconds). Long enough to view/coach,
// short enough that a leaked URL expires quickly.
export const SIGNED_URL_TTL = 60 * 60; // 1 hour

// Remove the Storage objects belonging to the given notes (best-effort).
// The note_images DB rows are cleared by FK cascade when a note/notebook is
// deleted; this stops the underlying bytes being orphaned in the bucket.
export async function purgeNoteImageFiles(
  db: SupabaseClient,
  userId: string,
  noteIds: string[],
): Promise<void> {
  if (noteIds.length === 0) return;
  const { data } = await db
    .from("note_images")
    .select("storage_path")
    .eq("user_id", userId)
    .in("note_id", noteIds);
  const paths = (data ?? []).map((r) => r.storage_path as string);
  if (paths.length > 0) {
    await db.storage.from(NOTE_IMAGES_BUCKET).remove(paths);
  }
}
