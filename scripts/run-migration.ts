/**
 * Migration runner using the Supabase Management API.
 * Requires: SUPABASE_ACCESS_TOKEN in .env.local
 * Get your token at: https://supabase.com/dashboard/account/tokens
 *
 * Usage: npx tsx scripts/run-migration.ts
 */
import fs from "fs";
import path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? "";

if (!ACCESS_TOKEN) {
  console.error(
    "\nError: SUPABASE_ACCESS_TOKEN is not set in .env.local\n" +
      "Get your personal access token at:\n" +
      "  https://supabase.com/dashboard/account/tokens\n" +
      "Then add SUPABASE_ACCESS_TOKEN=<token> to .env.local\n"
  );
  process.exit(1);
}

// Extract project ref from URL: https://<ref>.supabase.co
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error("Error: Could not extract project ref from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/001_initial_schema.sql"
);
const sql = fs.readFileSync(migrationPath, "utf-8");

async function main() {
  console.log(`\nRunning migration against project: ${projectRef}`);
  console.log(`Migration: ${path.basename(migrationPath)}\n`);

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (res.ok) {
    console.log("✓ Migration applied successfully.\n");
    process.exit(0);
  } else {
    const body = await res.text();
    console.error(`✗ Migration failed (HTTP ${res.status}):\n${body}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
