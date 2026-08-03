import { describe, it, expect } from "vitest";
import { computePackProgress, buildHeatmap, REVIEW_DUE_DAYS, type DrillAttemptRow } from "./progress";

const row = (overrides: Partial<DrillAttemptRow>): DrillAttemptRow => ({
  pack_id: "demo",
  cell_id: "a",
  passed: true,
  used_ref: false,
  created_at: new Date().toISOString(),
  ...overrides,
});

// Pinned once at module load, NOT read per call. With a live Date.now() inside
// the helper, a millisecond ticking over between building a fixture row and
// building the expectation made daysAgo(1) return two different timestamps —
// an intermittent 1ms off-by-one that failed roughly one run in three.
const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("computePackProgress", () => {
  const cellIds = ["a", "b", "c"];

  it("is not-started with no attempts at all", () => {
    const p = computePackProgress("demo", cellIds, []);
    expect(p.tier).toBe("not-started");
    expect(p.cellsPassed).toBe(0);
    expect(p.lastPassedAt).toBeNull();
  });

  it("is not-started when every attempt on the pack failed", () => {
    const attempts = [row({ cell_id: "a", passed: false })];
    expect(computePackProgress("demo", cellIds, attempts).tier).toBe("not-started");
  });

  it("is in-progress when some but not all cells have a pass", () => {
    const attempts = [row({ cell_id: "a" }), row({ cell_id: "b", passed: false })];
    const p = computePackProgress("demo", cellIds, attempts);
    expect(p.tier).toBe("in-progress");
    expect(p.cellsPassed).toBe(1);
  });

  it("is complete when every cell has a pass but at least one was helped", () => {
    const attempts = [
      row({ cell_id: "a", used_ref: false }),
      row({ cell_id: "b", used_ref: true }),
      row({ cell_id: "c", used_ref: false }),
    ];
    expect(computePackProgress("demo", cellIds, attempts).tier).toBe("complete");
  });

  it("is owned when every cell's most recent pass was hint-free", () => {
    const attempts = cellIds.map(id => row({ cell_id: id, used_ref: false }));
    expect(computePackProgress("demo", cellIds, attempts).tier).toBe("owned");
  });

  it("a later hint-free pass overrides an earlier helped pass on the same cell", () => {
    const attempts = [
      row({ cell_id: "a", used_ref: true, created_at: daysAgo(5) }),
      row({ cell_id: "a", used_ref: false, created_at: daysAgo(1) }),
      row({ cell_id: "b", used_ref: false }),
      row({ cell_id: "c", used_ref: false }),
    ];
    expect(computePackProgress("demo", cellIds, attempts).tier).toBe("owned");
  });

  it("a later fail does not erase an earlier pass on the same cell", () => {
    const attempts = [
      row({ cell_id: "a", passed: true, created_at: daysAgo(2) }),
      row({ cell_id: "a", passed: false, created_at: daysAgo(1) }),
      row({ cell_id: "b" }),
      row({ cell_id: "c" }),
    ];
    const p = computePackProgress("demo", cellIds, attempts);
    expect(p.cellsPassed).toBe(3);
    expect(p.tier).toBe("owned");
  });

  it("flips to review-due once the last pass is older than the threshold", () => {
    const attempts = cellIds.map(id => row({ cell_id: id, used_ref: false, created_at: daysAgo(REVIEW_DUE_DAYS + 1) }));
    expect(computePackProgress("demo", cellIds, attempts).tier).toBe("review-due");
  });

  it("stays owned just inside the review threshold", () => {
    const attempts = cellIds.map(id => row({ cell_id: id, used_ref: false, created_at: daysAgo(REVIEW_DUE_DAYS - 1) }));
    expect(computePackProgress("demo", cellIds, attempts).tier).toBe("owned");
  });

  it("ignores attempts from other packs", () => {
    const attempts = [row({ pack_id: "other-pack", cell_id: "a" })];
    expect(computePackProgress("demo", cellIds, attempts).tier).toBe("not-started");
  });

  it("lastPassedAt is the most recent pass across all cells", () => {
    const attempts = [
      row({ cell_id: "a", created_at: daysAgo(10) }),
      row({ cell_id: "b", created_at: daysAgo(1) }),
    ];
    const p = computePackProgress("demo", cellIds, attempts);
    expect(p.lastPassedAt).toBe(daysAgo(1));
  });
});

describe("buildHeatmap", () => {
  it("returns exactly `days` entries ending today (UTC)", () => {
    const heatmap = buildHeatmap([], 30);
    expect(heatmap).toHaveLength(30);
    const todayUTC = new Date().toISOString().slice(0, 10);
    expect(heatmap[heatmap.length - 1].date).toBe(todayUTC);
  });

  it("zero-fills days with no attempts", () => {
    const heatmap = buildHeatmap([], 7);
    expect(heatmap.every(d => d.count === 0)).toBe(true);
  });

  it("counts every attempt on a day, pass or fail", () => {
    const today = new Date().toISOString().slice(0, 10);
    const attempts: DrillAttemptRow[] = [
      row({ passed: true, created_at: `${today}T01:00:00.000Z` }),
      row({ passed: false, created_at: `${today}T02:00:00.000Z` }),
      row({ passed: true, created_at: `${today}T03:00:00.000Z` }),
    ];
    const heatmap = buildHeatmap(attempts, 7);
    expect(heatmap[heatmap.length - 1].count).toBe(3);
  });

  it("buckets by UTC calendar day, not exact timestamp", () => {
    const today = new Date().toISOString().slice(0, 10);
    const attempts: DrillAttemptRow[] = [
      row({ created_at: `${today}T00:00:00.001Z` }),
      row({ created_at: `${today}T23:59:59.999Z` }),
    ];
    const heatmap = buildHeatmap(attempts, 7);
    expect(heatmap[heatmap.length - 1].count).toBe(2);
  });

  it("attempts outside the window are dropped, not clamped into day 0", () => {
    const attempts: DrillAttemptRow[] = [row({ created_at: daysAgo(500) })];
    const heatmap = buildHeatmap(attempts, 7);
    expect(heatmap.every(d => d.count === 0)).toBe(true);
  });
});
