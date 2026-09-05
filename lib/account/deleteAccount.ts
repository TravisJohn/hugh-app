import type { SupabaseClient } from "@supabase/supabase-js";
import { logSafeError } from "@/lib/observability/log";
import {
  USER_BUCKETS, storagePrefix, generationsRedaction, summariseDeletion,
  type DeletionReceipt, type UserBucket,
} from "@/lib/account/deletionPlan";

/**
 * Delete one account, completely.
 *
 * The order is fixed by `DELETION_ORDER` and is load-bearing — see the comment
 * there. Everything the `auth.users` cascade cannot reach is removed FIRST,
 * because the cascade is what destroys the ability to find it.
 *
 * It fails LOUDLY. A deletion that half-succeeds and reports success is the
 * worst outcome available here: the learner is told their data is gone, and the
 * privacy policy describing this becomes untrue. So a failed storage sweep or a
 * failed redaction aborts before the account is dropped, leaving a state that
 * can be retried rather than one that cannot be repaired.
 */
export async function deleteAccount(
  service: SupabaseClient,
  userId:  string,
): Promise<DeletionReceipt> {
  const storageObjects      = await purgeUserStorage(service, userId);
  const generationsRedacted = await redactGenerations(service, userId);

  // Last. Cascades profiles, goals, tracks, milestones, notes, monitor rows,
  // usage_logs, operation_events, activity_events and the rest.
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(
      `Account rows were de-identified but the auth user could not be deleted: ${error.message}`
    );
  }

  const receipt = { userId, storageObjects, generationsRedacted };
  console.info(`[account] ${summariseDeletion(receipt)}`);
  return receipt;
}

/**
 * Remove every stored object under `<userId>/` in both user-keyed buckets.
 *
 * `list()` is not recursive and objects live at `<userId>/<parentId>/<file>`,
 * so this walks the two levels rather than assuming a flat prefix. Anything
 * that cannot be listed or removed throws: a silently skipped folder is exactly
 * the screenshot that outlives the account.
 */
async function purgeUserStorage(service: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;

  for (const bucket of USER_BUCKETS) {
    const paths = await listUserObjects(service, bucket, userId);
    if (paths.length === 0) continue;

    // Remove in batches — a learner with hundreds of screenshots would
    // otherwise send one very large request.
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await service.storage.from(bucket).remove(batch);
      if (error) {
        throw new Error(`Could not remove files from ${bucket}: ${error.message}`);
      }
      removed += batch.length;
    }
  }

  return removed;
}

/** Full object paths under one learner's folder in one bucket. */
async function listUserObjects(
  service: SupabaseClient,
  bucket:  UserBucket,
  userId:  string,
): Promise<string[]> {
  const root = storagePrefix(userId).replace(/\/$/, "");

  const { data: folders, error } = await service.storage.from(bucket).list(root, { limit: 1000 });
  if (error) throw new Error(`Could not list ${bucket} for ${userId}: ${error.message}`);
  if (!folders || folders.length === 0) return [];

  const paths: string[] = [];
  for (const entry of folders) {
    // A row with an id is a file sitting directly under the user folder; one
    // without is a folder (Supabase reports prefixes this way).
    if (entry.id) { paths.push(`${root}/${entry.name}`); continue; }

    const { data: files, error: e2 } =
      await service.storage.from(bucket).list(`${root}/${entry.name}`, { limit: 1000 });
    if (e2) throw new Error(`Could not list ${bucket}/${entry.name}: ${e2.message}`);
    for (const file of files ?? []) paths.push(`${root}/${entry.name}/${file.name}`);
  }

  return paths;
}

/**
 * De-identify the provenance rows that deliberately outlive the account.
 *
 * Must run while `user_id` still points at the learner: the FK is
 * `ON DELETE SET NULL`, so after the account goes there is nothing left to
 * select on.
 */
async function redactGenerations(service: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await service
    .from("track_generations")
    .update(generationsRedaction())
    .eq("user_id", userId)
    .select("id");

  if (error) {
    logSafeError("account deletion: redact track_generations", error, []);
    throw new Error(`Could not de-identify provenance rows: ${error.message}`);
  }

  return (data ?? []).length;
}
