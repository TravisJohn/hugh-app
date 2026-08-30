/**
 * Load `.env.local` into `process.env` for scripts run outside Next.
 *
 * Next injects environment variables for the app; a `tsx` script gets nothing,
 * so every script that talks to Supabase or Anthropic has to do this itself.
 * `run-migration.ts` and `health-check.ts` each carry their own inline copy of
 * this loop — this module exists so the next one does not become a third.
 *
 * Real environment variables always win. CI has no `.env.local` and passes
 * secrets in the environment instead, so a missing file is not an error here;
 * a script that needs a particular key checks for it and says so itself.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Read `.env.local` from the project root, without overwriting anything that
 * is already set. Returns the keys it added, which a script can log when it is
 * worth showing where its configuration came from.
 */
export function loadEnvLocal(root: string = process.cwd()): string[] {
  const envPath = path.resolve(root, ".env.local");
  if (!fs.existsSync(envPath)) return [];

  const added: string[] = [];
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key   = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key || key in process.env) continue;

    process.env[key] = value;
    added.push(key);
  }
  return added;
}

/**
 * Fetch a required variable, or exit with a message naming what is missing.
 *
 * Exiting rather than throwing is deliberate for a CLI: a stack trace above a
 * missing-key message buries the one line the operator needs to read.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`\nMissing ${key}. Add it to .env.local or set it in the environment.\n`);
    process.exit(1);
  }
  return value;
}
