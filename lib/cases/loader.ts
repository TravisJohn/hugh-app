import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Case, Manifest } from "@/types/cases";

/**
 * ── THE GCP SWAP SEAM ───────────────────────────────────────────────────────
 * Cases are static content. Today they live as JSON files under
 * `public/case-data/` and are read from the filesystem, server-side. This keeps
 * loading lazy: the library reads ONLY the manifest, and each case page reads
 * ONLY its own file — the app never holds all cases at once, so 500 cases weigh
 * the same as 5 on any given request.
 *
 * To move to GCP: replace the two `fs.readFile` calls below with `fetch()`
 * against a Cloud Storage bucket / Cloud CDN URL (e.g. a `CASES_BASE_URL` env).
 * Nothing else in the app changes — every caller goes through `loadManifest()`
 * and `loadCase()`.
 */
const CASE_DIR = path.join(process.cwd(), "public", "case-data");

/** The active batch's lightweight index (stubs only — no full case content). */
export async function loadManifest(): Promise<Manifest> {
  const raw = await fs.readFile(path.join(CASE_DIR, "manifest.json"), "utf8");
  return JSON.parse(raw) as Manifest;
}

/** One full case by id, or null if the id is invalid or the file is missing. */
export async function loadCase(id: string): Promise<Case | null> {
  // Slug guard — ids come from the URL, so never let one escape CASE_DIR.
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    const raw = await fs.readFile(path.join(CASE_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as Case;
  } catch {
    return null;
  }
}
