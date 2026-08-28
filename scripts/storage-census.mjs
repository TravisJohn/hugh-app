// Census: how much data actually sits in Supabase Storage.
//
//   node scripts/storage-census.mjs
//
// Written to answer one question before designing the backup destination: are
// the buckets a few megabytes (in which case any destination works) or hundreds
// (in which case GitHub's artifact quota rules itself out). Read-only — it lists
// metadata and never downloads an object.
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { BUCKETS, adminClient, walk, mb } from "./lib/supabase-storage.mjs";

const admin = adminClient();
const pad = (s, n) => String(s).padStart(n);

let grand = 0;
for (const bucket of BUCKETS) {
  let files;
  try {
    files = await walk(admin, bucket);
  } catch (err) {
    console.log(`${bucket.padEnd(20)} ERROR — ${err.message}`);
    continue;
  }
  const bytes = files.reduce((n, f) => n + f.size, 0);
  grand += bytes;
  const newest = files.map((f) => f.at).sort().at(-1) ?? "—";
  console.log(`${bucket.padEnd(20)} ${pad(files.length, 5)} objects  ${pad(mb(bytes), 9)} MB   newest: ${newest}`);
  for (const f of [...files].sort((a, b) => b.size - a.size).slice(0, 3)) {
    console.log(`   largest: ${pad(mb(f.size), 9)} MB  ${f.path}`);
  }
}
console.log("-".repeat(70));
console.log(`${"TOTAL".padEnd(20)} ${" ".repeat(14)}${pad(mb(grand), 9)} MB`);
console.log(`\nGitHub Actions artifact storage, free account: 500 MB total.`);
console.log(`Supabase Free storage cap: 1 GB — the ceiling this can grow to.`);
