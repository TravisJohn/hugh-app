// Delete an auth user by email — completely.
//
//   npx tsx scripts/delete-user.ts someone@example.com
//
// Replaces the old delete-user.mjs, which called auth.admin.deleteUser and
// nothing else. That relied entirely on the FK cascade, and the cascade does
// NOT reach Storage (`note-images`, `monitor-documents` have no foreign key to
// auth.users) or `track_generations` (ON DELETE SET NULL by design). So it
// reported success while leaving the learner's screenshots and résumés in the
// bucket and their typed topic in the provenance table.
//
// This imports the SAME routine the app uses, rather than repeating the steps:
// two implementations of "delete everything" is how one of them quietly stops
// covering a bucket. `lib/account/deleteAccount.ts` deliberately takes its
// Supabase client as a parameter so it can be shared with a plain Node process
// — it does not import `server-only`, which would throw here.
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { deleteAccount } from "../lib/account/deleteAccount";
import { summariseDeletion } from "../lib/account/deletionPlan";

const EMAIL = process.argv[2];
if (!EMAIL) {
  console.error("Usage: npx tsx scripts/delete-user.ts <email>");
  process.exit(1);
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  const user = await findUserByEmail(EMAIL);
  if (!user) {
    console.log(`No user found with email ${EMAIL} — nothing to delete.`);
    return;
  }

  const receipt = await deleteAccount(admin, user.id);
  console.log(`\n✓ ${summariseDeletion(receipt)}`);
  console.log("You can now sign up with this email again from /signup.");
}

main().catch(err => {
  console.error("\n✗ Failed:", err instanceof Error ? err.message : err);
  console.error("The account still exists, but some of its stored files may already");
  console.error("have been removed. Run this again to finish — repeating is safe.");
  process.exit(1);
});
