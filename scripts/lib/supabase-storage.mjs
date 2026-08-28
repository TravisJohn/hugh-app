// Shared helpers for the two scripts that talk to Supabase Storage:
// storage-census.mjs (how big is it?) and mirror-storage.mjs (copy what is new).
// Extracted so the recursive walk exists once — a lister that silently missed
// nested folders would under-report the census and under-copy the mirror, and
// that bug is much easier to not-notice twice than once.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** The two private buckets the app writes to (migrations 027 and 041). */
export const BUCKETS = ["note-images", "monitor-documents"];

/**
 * Read config from the environment, falling back to .env.local for local runs.
 * CI has no .env.local and passes real environment variables instead, so a
 * missing file is only an error when the variables are absent too.
 */
export function loadConfig(envUrl = import.meta.url) {
  const env = { ...process.env };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const raw = readFileSync(new URL("../../.env.local", envUrl), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (env[m[1]] === undefined) env[m[1]] = v;
      }
    } catch {
      /* No .env.local is fine when the variables came from the environment. */
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or .env.local).");
  }
  return { url, key };
}

/**
 * Service-role client: bypasses RLS on purpose, so it sees every learner's files.
 *
 * Needs Node >= 22. `createClient` eagerly constructs a RealtimeClient, which
 * requires a global WebSocket that Node 20 does not have — neither script here
 * ever opens a channel, but both die in that constructor. Checked explicitly so
 * an old runtime reports itself instead of throwing from inside a dependency.
 */
export function adminClient() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    throw new Error(
      `Node ${process.versions.node} is too old: @supabase/supabase-js builds a ` +
        `realtime client on construction and needs a native WebSocket (Node >= 22).`
    );
  }
  const { url, key } = loadConfig();
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const PAGE = 100;

/**
 * List every object under a bucket, recursively.
 * Storage `list` is per-prefix, not recursive, and marks a folder by returning
 * a row whose `id` is null — so a flat list would report learner folders as
 * files and miss everything inside them.
 */
export async function walk(admin, bucket, prefix = "") {
  let files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const path = prefix ? `${prefix}/${row.name}` : row.name;
      if (row.id === null) files = files.concat(await walk(admin, bucket, path));
      else files.push({ path, size: row.metadata?.size ?? 0, at: row.created_at });
    }
    if (data.length < PAGE) break;
  }
  return files;
}

export const mb = (b) => (b / 1024 / 1024).toFixed(2);
