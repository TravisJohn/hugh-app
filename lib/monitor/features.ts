// ── The surface registry ────────────────────────────────────────────────────
// The ten surfaces the Usage view reports on, in one ordered list.
//
// This is the single source of truth. The view iterates THIS, never the table:
// an id in `activity_events` that is not here renders nowhere, and a surface
// here with no rows renders as an honest empty calendar. Adding a surface to
// Hugh means one entry here and one `<RecordActivity>` on its page — and
// `features.test.ts` asserts those two sets match, so a surface cannot be
// instrumented without appearing, or appear without being instrumented.
//
// Pure: no React, no Supabase.

export interface MonitorFeature {
  /** Stored in `activity_events.feature`. Stable — changing one orphans history. */
  id:    string;
  label: string;
  /** Where the learner goes. Used for the link on each calendar. */
  route: string;
  /**
   * What its seeded history actually covers, or null when the seed is complete.
   *
   * Stated per surface rather than as one footnote, because the gaps are
   * different sizes: Case Lab has no history at all, while Cloud has history
   * only for the days its assistant was used. A grid that looks the same for
   * both would be lying about one of them.
   */
  seedCaveat: string | null;
}

/**
 * Order follows the learning loop, then the tools: learn, ask, prove, practise,
 * apply, look things up, keep notes. Not alphabetical — a list sorted by name
 * would separate Review from Mastery, which are two halves of one milestone.
 */
export const MONITOR_FEATURES: readonly MonitorFeature[] = [
  { id: "learn",        label: "Learn",           route: "/home/learn", seedCaveat: null },
  { id: "ask",          label: "Ask Hugh",        route: "/home/learn", seedCaveat: null },
  { id: "review",       label: "Review quiz",     route: "/home/learn", seedCaveat: null },
  { id: "mastery",      label: "Prove mastery",   route: "/home/learn", seedCaveat: null },
  { id: "code-drill",   label: "Code drills",     route: "/code/start", seedCaveat: null },
  { id: "code-sandbox", label: "Code sandbox",    route: "/code",
    seedCaveat: "History before today covers days you used its chat — running Python left no trace." },
  { id: "cases",        label: "The Case Room",   route: "/cases",      seedCaveat: null },
  { id: "case-lab",     label: "Case Lab",        route: "/cases/lab",
    seedCaveat: "No history before today — Case Lab never wrote anything down." },
  { id: "cloud",        label: "Cloud reference", route: "/cloud",
    seedCaveat: "History before today covers days you used its assistant — browsing left no trace." },
  { id: "notes",        label: "Notes",           route: "/notes",      seedCaveat: null },
] as const;

/**
 * The legacy interview loop is deliberately absent. It is not on /home, and a
 * calendar for it in Monitor would resurrect it as a visible surface. `tts`
 * rows in `usage_logs` are excluded for a different reason: they belong to
 * whichever surface was speaking, and cannot be attributed to one.
 */
export const EXCLUDED_FROM_USAGE = ["interview", "tts"] as const;

export const FEATURE_IDS: readonly string[] = MONITOR_FEATURES.map(f => f.id);

export function isMonitorFeature(id: unknown): id is string {
  return typeof id === "string" && FEATURE_IDS.includes(id);
}

export function featureById(id: string): MonitorFeature | null {
  return MONITOR_FEATURES.find(f => f.id === id) ?? null;
}
