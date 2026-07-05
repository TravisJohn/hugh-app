import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { CaseLabCase, CaseLabManifest } from "@/types/case-lab";

/**
 * ── THE GCS SWAP SEAM (shared with the Case Room) ───────────────────────────
 * Case Lab content is static and fully public — there is no grading in v1, so
 * nothing is sealed. Today it lives as JSON under `public/case-lab/` and is read
 * from the filesystem, server-side. The feed reads ONLY the manifest; each case
 * page reads ONLY its own file. The 10k-row CSVs sit next to the JSON and are
 * served directly by Next as static assets (`/case-lab/<id>/data.csv`).
 *
 * To move to GCS: replace the two `fs.readFile` calls with `fetch()` against a
 * bucket / CDN URL. Nothing else changes — every caller goes through these two.
 */
const LAB_DIR = path.join(process.cwd(), "public", "case-lab");

/** The active batch's lightweight index (stubs only — no full case content). */
export async function loadLabManifest(): Promise<CaseLabManifest> {
  const raw = await fs.readFile(path.join(LAB_DIR, "manifest.json"), "utf8");
  return JSON.parse(raw) as CaseLabManifest;
}

/** One full case by id, or null if the id is invalid or the file is missing. */
export async function loadLabCase(id: string): Promise<CaseLabCase | null> {
  // Slug guard — ids come from the URL, so never let one escape LAB_DIR.
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    const raw = await fs.readFile(path.join(LAB_DIR, id, "case.json"), "utf8");
    return JSON.parse(raw) as CaseLabCase;
  } catch {
    return null;
  }
}
