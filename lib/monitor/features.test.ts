import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  MONITOR_FEATURES, FEATURE_IDS, EXCLUDED_FROM_USAGE,
  isMonitorFeature, featureById,
} from "./features";

describe("the registry itself", () => {
  it("has no duplicate ids, since an id is a database key", () => {
    expect(new Set(FEATURE_IDS).size).toBe(FEATURE_IDS.length);
  });

  it("gives every surface a label and a route to get there", () => {
    for (const f of MONITOR_FEATURES) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.route.startsWith("/")).toBe(true);
    }
  });

  it("uses ids that are safe as stored keys", () => {
    // Lowercase and hyphens only: these are written to the database and
    // compared as strings, so a stray space or capital becomes a second
    // surface that renders nowhere.
    for (const id of FEATURE_IDS) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("leaves the legacy interview loop out", () => {
    // A calendar for /interview would resurrect a surface that is deliberately
    // off /home. `tts` is excluded for a different reason: it belongs to
    // whichever surface was speaking and cannot be attributed to one.
    expect(FEATURE_IDS).not.toContain("interview");
    expect(FEATURE_IDS).not.toContain("tts");
    expect(EXCLUDED_FROM_USAGE).toEqual(["interview", "tts"]);
  });

  it("states a caveat only where the seeded history is genuinely partial", () => {
    // The gaps are different sizes — Case Lab has no history at all, Cloud has
    // history only for days its assistant was used. A grid that looked the same
    // for both would be lying about one of them.
    expect(featureById("case-lab")?.seedCaveat).toBeTruthy();
    expect(featureById("cloud")?.seedCaveat).toBeTruthy();
    expect(featureById("code-sandbox")?.seedCaveat).toBeTruthy();
    expect(featureById("notes")?.seedCaveat).toBeNull();
  });
});

describe("isMonitorFeature / featureById", () => {
  it("accepts a registered id and refuses anything else", () => {
    expect(isMonitorFeature("notes")).toBe(true);
    expect(isMonitorFeature("interview")).toBe(false);
    expect(isMonitorFeature("")).toBe(false);
    expect(isMonitorFeature(null)).toBe(false);
  });

  it("returns null rather than throwing for an unknown id", () => {
    expect(featureById("nope")).toBeNull();
  });
});

// ── The registry and the pages must agree ───────────────────────────────────
// This is the test that stops the two drifting. A surface instrumented but not
// registered would write rows nothing renders; a surface registered but not
// instrumented would show a permanently empty calendar that reads as "never
// used" when it is really "never recorded".

/** Every `<RecordActivity feature="…" />` in the app directory. */
function instrumentedFeatures(dir: string, found = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      instrumentedFeatures(path, found);
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    const source = readFileSync(path, "utf8");
    for (const m of source.matchAll(/<RecordActivity[^>]*feature=["']([^"']+)["']/g)) {
      found.add(m[1]);
    }
  }
  return found;
}

describe("registry ↔ pages", () => {
  const instrumented = instrumentedFeatures("app");

  it("instruments every surface the registry promises", () => {
    const missing = FEATURE_IDS.filter(id => !instrumented.has(id));
    expect(missing, `registered but never recorded: ${missing.join(", ")}`).toEqual([]);
  });

  it("registers every surface the app records", () => {
    const unknown = [...instrumented].filter(id => !FEATURE_IDS.includes(id));
    expect(unknown, `recorded but not in the registry: ${unknown.join(", ")}`).toEqual([]);
  });
});
