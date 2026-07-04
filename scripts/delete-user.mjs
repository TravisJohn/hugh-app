// Delete an auth user by email (and everything cascading from it: profile,
// learning_goals, tracks → milestones, usage_logs). Use to reset a test account
// so you can re-run the sign-up / email-verification flow from scratch.
//
//   node scripts/delete-user.mjs vtravisjohn@yahoo.com
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const EMAIL = process.argv[2];
if (!EMAIL) {
  console.error("Usage: node scripts/delete-user.mjs <email>");
  process.exit(1);
}

function loadEnv() {
  const env = {};
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
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

async function findUserByEmail(email) {
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
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  console.log(`✓ Deleted ${EMAIL} (id ${user.id}). Profile + learning data cascaded.`);
  console.log("You can now sign up with this email again from /signup.");
}

main().catch(err => {
  console.error("\n✗ Failed:", err.message ?? err);
  process.exit(1);
});
