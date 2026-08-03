import { describe, it, expect } from "vitest";
import type { DrillAttemptRow } from "./progress";
import {
  HEAT_HALF_LIFE_DAYS,
  HEAT_THRESHOLDS,
  computeAllGroupHeat,
  computeAllPackHeat,
  decayedCount,
  heatLevel,
  readHeat,
  type PackHeatInput,
} from "./heat";

// A fixed "now" so every assertion is about the decay maths, never the clock.
const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const MS_PER_DAY = 86_400_000;

/** ISO timestamp for `days` before NOW. */
const daysAgo = (days: number) => new Date(NOW - days * MS_PER_DAY).toISOString();

function attempt(packId: string, cellId: string, days: number, passed = true): DrillAttemptRow {
  return { pack_id: packId, cell_id: cellId, passed, used_ref: false, created_at: daysAgo(days) };
}

/** `n` attempts on the same pack, all `days` old, on distinct cells. */
function attempts(packId: string, n: number, days: number): DrillAttemptRow[] {
  return Array.from({ length: n }, (_, i) => attempt(packId, `c${i}`, days));
}

describe("decayedCount", () => {
  it("scores a brand-new attempt at ~1", () => {
    expect(decayedCount([daysAgo(0)], NOW)).toBeCloseTo(1, 6);
  });

  it("halves every half-life", () => {
    expect(decayedCount([daysAgo(HEAT_HALF_LIFE_DAYS)], NOW)).toBeCloseTo(0.5, 6);
    expect(decayedCount([daysAgo(HEAT_HALF_LIFE_DAYS * 2)], NOW)).toBeCloseTo(0.25, 6);
    expect(decayedCount([daysAgo(HEAT_HALF_LIFE_DAYS * 3)], NOW)).toBeCloseTo(0.125, 6);
  });

  it("sums across attempts", () => {
    expect(decayedCount([daysAgo(0), daysAgo(HEAT_HALF_LIFE_DAYS)], NOW)).toBeCloseTo(1.5, 6);
  });

  it("is zero for no attempts", () => {
    expect(decayedCount([], NOW)).toBe(0);
  });

  it("clamps future timestamps to now instead of scoring them above 1", () => {
    // Device clock ahead of the server would otherwise read as bonus practice.
    expect(decayedCount([daysAgo(-90)], NOW)).toBeCloseTo(1, 6);
  });

  it("ignores unparseable timestamps rather than poisoning the sum", () => {
    expect(decayedCount(["not-a-date", daysAgo(0)], NOW)).toBeCloseTo(1, 6);
  });
});

describe("heatLevel", () => {
  it("treats no practice as cold", () => {
    expect(heatLevel(0)).toBe("cold");
    expect(heatLevel(-1)).toBe("cold");
  });

  it("buckets on the exported thresholds, inclusive of each lower bound", () => {
    expect(heatLevel(0.0001)).toBe("cool");
    expect(heatLevel(HEAT_THRESHOLDS.warm)).toBe("warm");
    expect(heatLevel(HEAT_THRESHOLDS.hot)).toBe("hot");
    expect(heatLevel(HEAT_THRESHOLDS.blazing)).toBe("blazing");
  });

  it("keeps the thresholds strictly ascending", () => {
    expect(HEAT_THRESHOLDS.cool).toBeLessThan(HEAT_THRESHOLDS.warm);
    expect(HEAT_THRESHOLDS.warm).toBeLessThan(HEAT_THRESHOLDS.hot);
    expect(HEAT_THRESHOLDS.hot).toBeLessThan(HEAT_THRESHOLDS.blazing);
  });
});

describe("readHeat", () => {
  it("is cold with no attempts", () => {
    expect(readHeat([], 10, NOW)).toEqual({
      score: 0, level: "cold", attempts: 0, lastAttemptAt: null,
    });
  });

  it("is cold rather than dividing by zero when the pack has no reps", () => {
    const r = readHeat(attempts("p", 3, 0), 0, NOW);
    expect(r.level).toBe("cold");
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it("scores one full pass today at ~1.0 per rep, landing on hot", () => {
    const r = readHeat(attempts("p", 10, 0), 10, NOW);
    expect(r.score).toBeCloseTo(1, 6);
    expect(r.level).toBe("hot");
    expect(r.attempts).toBe(10);
  });

  it("counts failed attempts too — heat is time spent, not success", () => {
    const failed = Array.from({ length: 10 }, (_, i) => attempt("p", `c${i}`, 0, false));
    expect(readHeat(failed, 10, NOW).score).toBeCloseTo(1, 6);
  });

  it("cools as practice ages — the map can go backwards", () => {
    const fresh = readHeat(attempts("p", 10, 0), 10, NOW);
    const stale = readHeat(attempts("p", 10, 90), 10, NOW);
    expect(stale.score).toBeLessThan(fresh.score);
    expect(fresh.level).toBe("hot");
    expect(stale.level).toBe("cool"); // 0.125/rep — practised once, long ago
  });

  it("stays warm for old practice that was heavy enough", () => {
    // 40 reps a half-life ago = 40 * 0.5 / 10 reps = 2.0 per rep.
    expect(readHeat(attempts("p", 40, HEAT_HALF_LIFE_DAYS), 10, NOW).level).toBe("hot");
  });

  it("reports the most recent attempt, not the first or last row seen", () => {
    const rows = [attempt("p", "a", 30), attempt("p", "b", 2), attempt("p", "c", 15)];
    expect(readHeat(rows, 10, NOW).lastAttemptAt).toBe(daysAgo(2));
  });
});

describe("computeAllPackHeat", () => {
  const packs: PackHeatInput[] = [
    { id: "explore", lang: "python", repCount: 10 },
    { id: "rag", lang: "python", repCount: 10 },
  ];

  it("gives every pack a reading, including untouched ones", () => {
    const heat = computeAllPackHeat(packs, attempts("explore", 10, 0), NOW);
    expect(Object.keys(heat).sort()).toEqual(["explore", "rag"]);
    expect(heat.explore.level).toBe("hot");
    expect(heat.rag.level).toBe("cold");
  });

  it("does not leak one pack's attempts into another", () => {
    const heat = computeAllPackHeat(packs, attempts("explore", 30, 0), NOW);
    expect(heat.rag.attempts).toBe(0);
    expect(heat.explore.attempts).toBe(30);
  });

  it("ignores attempts for packs that no longer exist", () => {
    const heat = computeAllPackHeat(packs, attempts("deleted-pack", 10, 0), NOW);
    expect(Object.keys(heat).sort()).toEqual(["explore", "rag"]);
    expect(heat.explore.level).toBe("cold");
  });
});

describe("computeAllGroupHeat", () => {
  // Real taxonomy, synthetic rep counts — 10 reps per pack keeps the arithmetic
  // legible while still exercising the real group membership.
  const PYTHON_PACKS: PackHeatInput[] = [
    "lets-do-this-values-types", "lets-do-this-collections", "lets-do-this-control-flow",
    "for-loop-constructs", "lets-do-this-functions", "lets-do-this-oop",
    "lets-do-this-files-envs-logging", "lets-do-this-exceptions-typing-status",
    "clean-shape", "explore", "build-chart", "linear-regression", "forecasting",
    "preprocessing", "validation", "logistic-regression", "decision-trees",
    "naive-bayes", "kmeans", "neural-network",
    "rag", "automation", "automation-ii", "airflow",
    "lets-do-this-api-requests", "lets-do-this-api-routing",
  ].map(id => ({ id, lang: "python" as const, repCount: 10 }));

  const SQL_PACKS: PackHeatInput[] = [
    "sql-clean-shape", "sql-explore", "sql-build-chart",
    "sql-linear-regression", "sql-forecasting",
  ].map(id => ({ id, lang: "sql" as const, repCount: 10 }));

  const ALL = [...PYTHON_PACKS, ...SQL_PACKS];

  it("covers every group that has packs in the language", () => {
    const heat = computeAllGroupHeat(ALL, [], "python", NOW);
    expect(Object.keys(heat).sort()).toEqual([
      "ai-retrieval", "analysis", "apis", "automation", "language-basics", "machine-learning",
    ]);
  });

  it("omits groups with no packs in the language", () => {
    expect(Object.keys(computeAllGroupHeat(ALL, [], "sql", NOW))).toEqual(["analysis"]);
  });

  it("rolls a pack's attempts up into its group", () => {
    const heat = computeAllGroupHeat(ALL, attempts("rag", 10, 0), "python", NOW);
    expect(heat["ai-retrieval"].level).toBe("hot"); // 10 attempts / 10 reps = 1.0
    expect(heat["analysis"].level).toBe("cold");
  });

  it("normalises per rep, so a small group isn't outranked by a big one at equal effort", () => {
    // 10 fresh attempts on the single-pack AI group (10 reps) vs. 10 on the
    // seven-pack ML group (70 reps). Same raw volume; ML is thinner per rep.
    const aiHeat = computeAllGroupHeat(ALL, attempts("rag", 10, 0), "python", NOW);
    const mlHeat = computeAllGroupHeat(ALL, attempts("kmeans", 10, 0), "python", NOW);

    expect(aiHeat["ai-retrieval"].score).toBeCloseTo(1, 6);
    expect(mlHeat["machine-learning"].score).toBeCloseTo(10 / 70, 6);
    expect(aiHeat["ai-retrieval"].score).toBeGreaterThan(mlHeat["machine-learning"].score);
  });

  it("reaches the same level for a big group only when the whole group is drilled", () => {
    const everyMlPack = ["preprocessing", "validation", "logistic-regression", "decision-trees",
      "naive-bayes", "kmeans", "neural-network"].flatMap(id => attempts(id, 10, 0));
    const heat = computeAllGroupHeat(ALL, everyMlPack, "python", NOW);
    expect(heat["machine-learning"].score).toBeCloseTo(1, 6);
    expect(heat["machine-learning"].level).toBe("hot");
  });

  it("keeps SQL practice out of the Python analysis cell", () => {
    // The Python branch shows only Python leaves, so SQL reps must not warm it.
    const sqlWork = attempts("sql-explore", 20, 0);
    expect(computeAllGroupHeat(ALL, sqlWork, "python", NOW)["analysis"].level).toBe("cold");
    expect(computeAllGroupHeat(ALL, sqlWork, "sql", NOW)["analysis"].level).toBe("warm");
  });

  it("sums attempts across several packs in one group", () => {
    const mixed = [...attempts("clean-shape", 5, 0), ...attempts("explore", 5, 0)];
    const heat = computeAllGroupHeat(ALL, mixed, "python", NOW);
    expect(heat["analysis"].attempts).toBe(10);
    expect(heat["analysis"].score).toBeCloseTo(10 / 50, 6); // 5 python analysis packs
  });
});
