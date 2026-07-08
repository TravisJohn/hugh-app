import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { CloudManifest, CloudProvider, Service } from "@/types/cloud";
import { PROVIDERS } from "@/types/cloud";

/**
 * ── THE GCP SWAP SEAM ───────────────────────────────────────────────────────
 * Cloud-Skills content is static. Today it lives as JSON under
 * `public/cloud-data/` and is read from the filesystem, server-side. Loading is
 * lazy: the landing reads ONLY the manifest, and each service page reads ONLY
 * its own file — the app never holds the whole catalog at once.
 *
 * To move to GCP: replace the two `fs.readFile` calls below with `fetch()`
 * against a Cloud Storage bucket / CDN URL (e.g. a `CLOUD_DATA_BASE_URL` env).
 * Nothing else in the app changes — every caller goes through `loadCloudManifest()`
 * and `loadService()`. Mirrors `lib/cases/loader.ts`.
 */
const CLOUD_DIR = path.join(process.cwd(), "public", "cloud-data");

function isProvider(v: string): v is CloudProvider {
  return (PROVIDERS as string[]).includes(v);
}

/** The lightweight catalog index (stubs only — no full write-ups). */
export async function loadCloudManifest(): Promise<CloudManifest> {
  const raw = await fs.readFile(path.join(CLOUD_DIR, "manifest.json"), "utf8");
  return JSON.parse(raw) as CloudManifest;
}

/** One full service by provider + id, or null if unknown/invalid/missing. */
export async function loadService(
  provider: string,
  id: string,
): Promise<Service | null> {
  // Path guards — provider and id both come from the URL, so never let one
  // escape CLOUD_DIR.
  if (!isProvider(provider)) return null;
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    const raw = await fs.readFile(
      path.join(CLOUD_DIR, provider, `${id}.json`),
      "utf8",
    );
    return JSON.parse(raw) as Service;
  } catch {
    return null;
  }
}
