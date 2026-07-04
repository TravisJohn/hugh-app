// Diagnostic: print an auth user's confirmation state by email.
//   node scripts/check-user.mjs vtravisjohn@yahoo.com
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const EMAIL = process.argv[2];
if (!EMAIL) { console.error("Usage: node scripts/check-user.mjs <email>"); process.exit(1); }

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

const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const u = data.users.find(x => x.email?.toLowerCase() === EMAIL.toLowerCase());
if (!u) { console.log(`NOT FOUND — no signup reached Supabase for ${EMAIL}.`); process.exit(0); }
console.log("email:               ", u.email);
console.log("created_at:          ", u.created_at);
console.log("email_confirmed_at:  ", u.email_confirmed_at ?? "(null — NOT confirmed)");
console.log("confirmation_sent_at:", u.confirmation_sent_at ?? "(null — no confirmation email attempted)");
