// Approve a stuck user (or all pending users) so they clear the /pending wall.
//   node scripts/approve-user.mjs vtravisjohn@yahoo.com   → approve one
//   node scripts/approve-user.mjs --all                   → approve everyone
//                                                            currently pending
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
// Never touches is_blocked — blocked users stay blocked.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ARG = process.argv[2];
if (!ARG) {
  console.error("Usage: node scripts/approve-user.mjs <email>|--all");
  process.exit(1);
}

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
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
  if (ARG === "--all") {
    const { data: pending, error } = await admin
      .from("profiles")
      .select("user_id")
      .eq("approved", false)
      .eq("is_blocked", false);
    if (error) throw error;
    if (!pending?.length) { console.log("No pending users — nothing to do."); return; }
    const ids = pending.map(p => p.user_id);
    const { error: uErr } = await admin.from("profiles").update({ approved: true }).in("user_id", ids);
    if (uErr) throw uErr;
    console.log(`✓ Approved ${ids.length} pending user(s).`);
    return;
  }

  const user = await findUserByEmail(ARG);
  if (!user) { console.log(`No user found with email ${ARG}.`); return; }
  const { error } = await admin.from("profiles").update({ approved: true }).eq("user_id", user.id);
  if (error) throw error;
  console.log(`✓ Approved ${ARG} — they can now enter the app.`);
}

main().catch(err => { console.error("\n✗ Failed:", err.message ?? err); process.exit(1); });
