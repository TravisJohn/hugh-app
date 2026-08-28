// Incremental mirror of Supabase Storage onto local disk.
//
//   node scripts/mirror-storage.mjs <target-dir> [--dry-run]
//
// Copies any object that is not already present at <target-dir>/<bucket>/<path>.
// Incremental rather than a full copy because the objects are immutable: the app
// writes each one under a fresh UUID and never edits it, so "already on disk"
// is the same answer as "already current". A nightly full copy of 107 MB would
// exhaust a free GitHub artifact quota in four days; this uploads it once.
//
// Deletions are NOT mirrored, deliberately. A backup that faithfully reproduces
// an accidental delete is not a backup. Objects removed upstream stay here.
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (env or .env.local).

import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { BUCKETS, adminClient, walk, mb } from "./lib/supabase-storage.mjs";

const TARGET = process.argv[2];
const DRY = process.argv.includes("--dry-run");
if (!TARGET) {
  console.error("Usage: node scripts/mirror-storage.mjs <target-dir> [--dry-run]");
  process.exit(1);
}

const admin = adminClient();

let copied = 0, skipped = 0, bytes = 0, failed = 0;

for (const bucket of BUCKETS) {
  const files = await walk(admin, bucket);
  console.log(`${bucket}: ${files.length} objects upstream`);

  for (const f of files) {
    const dest = join(TARGET, bucket, f.path);

    // Size-match rather than mere existence, so a run interrupted mid-write
    // leaves a short file that the next run notices and replaces.
    if (existsSync(dest) && statSync(dest).size === f.size && f.size > 0) {
      skipped++;
      continue;
    }
    if (DRY) {
      console.log(`  would copy ${bucket}/${f.path} (${mb(f.size)} MB)`);
      copied++; bytes += f.size;
      continue;
    }

    const { data, error } = await admin.storage.from(bucket).download(f.path);
    if (error || !data) {
      // Report and keep going: one unreadable object must not cost us the other
      // 841. The non-zero exit at the end is what makes the failure visible.
      console.error(`  FAIL ${bucket}/${f.path}: ${error?.message ?? "no body"}`);
      failed++;
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
    copied++; bytes += f.size;
    console.log(`  + ${bucket}/${f.path} (${mb(f.size)} MB)`);
  }
}

console.log("-".repeat(70));
console.log(`copied ${copied} (${mb(bytes)} MB) · already present ${skipped} · failed ${failed}`);
if (failed > 0) {
  console.error(`\n${failed} object(s) could not be copied — this mirror is incomplete.`);
  process.exit(1);
}
