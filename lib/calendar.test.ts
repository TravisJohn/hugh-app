import { describe, it, expect } from "vitest";
import {
  bucketByDay,
  bucketPreCounted,
  bucketByPeak,
  heatLevel,
  effortLevel,
  EFFORT_MAX,
  peakCount,
  activeDayCount,
  toWeekColumns,
  type HeatmapDay,
} from "./calendar";

// A fixed clock so every window assertion is exact rather than "roughly today".
// 2026-06-17 is a Wednesday (UTC day 3), which the week-column tests depend on.
const NOW = new Date("2026-06-17T12:00:00.000Z");

describe("bucketByDay", () => {
  it("returns exactly `days` cells, oldest first, ending on today", () => {
    const out = bucketByDay([], 30, NOW);
    expect(out).toHaveLength(30);
    expect(out[0].date).toBe("2026-05-19");
    expect(out[29].date).toBe("2026-06-17");
  });

  it("zero-fills days with nothing logged rather than omitting them", () => {
    // A gap must render as an empty cell, not shorten the grid — otherwise the
    // calendar silently compresses time and every date lines up wrong.
    const out = bucketByDay(["2026-06-17T09:00:00.000Z"], 7, NOW);
    expect(out).toHaveLength(7);
    expect(out.filter(d => d.count === 0)).toHaveLength(6);
  });

  it("counts several timestamps on one UTC day into that one cell", () => {
    const out = bucketByDay(
      [
        "2026-06-17T00:00:00.001Z",
        "2026-06-17T12:30:00.000Z",
        "2026-06-17T23:59:59.999Z",
      ],
      7,
      NOW,
    );
    expect(out[6]).toEqual({ date: "2026-06-17", count: 3 });
  });

  it("accepts a bare YYYY-MM-DD date as well as a full ISO timestamp", () => {
    // Skill entries store a DATE column; drill attempts store a timestamptz.
    // Both must bucket without the caller normalising first.
    const out = bucketByDay(["2026-06-16", "2026-06-16T22:00:00.000Z"], 7, NOW);
    expect(out[5]).toEqual({ date: "2026-06-16", count: 2 });
  });

  it("drops timestamps outside the window instead of clamping them into day 0", () => {
    // Clamping would let a burst of activity six months ago masquerade as
    // activity at the start of the visible window.
    const out = bucketByDay(["2025-01-04T10:00:00.000Z"], 7, NOW);
    expect(out.every(d => d.count === 0)).toBe(true);
  });

  it("ignores the order timestamps arrive in", () => {
    const forward = bucketByDay(["2026-06-15", "2026-06-16", "2026-06-17"], 7, NOW);
    const reverse = bucketByDay(["2026-06-17", "2026-06-16", "2026-06-15"], 7, NOW);
    expect(reverse).toEqual(forward);
  });
});

describe("bucketPreCounted", () => {
  it("uses each row's own count rather than counting rows", () => {
    // activity_events stores one row per surface per day with a hits counter.
    // Treating it like a timestamp list would flatten 40 hits to 1.
    const out = bucketPreCounted([{ date: "2026-06-17", count: 40 }], 7, NOW);
    expect(out[6].count).toBe(40);
  });

  it("sums rows that land on the same day", () => {
    const out = bucketPreCounted(
      [{ date: "2026-06-17", count: 3 }, { date: "2026-06-17", count: 4 }],
      7,
      NOW,
    );
    expect(out[6].count).toBe(7);
  });

  it("drops rows outside the window, like bucketByDay", () => {
    const out = bucketPreCounted([{ date: "2020-01-01", count: 99 }], 7, NOW);
    expect(out.every(d => d.count === 0)).toBe(true);
  });
});

describe("bucketByPeak", () => {
  it("keeps the day's highest value, not the sum", () => {
    // Monitor shades by "how hard did I go". Summing would let three easy
    // sessions out-shade one hard one, and could exceed the top of the scale.
    const out = bucketByPeak([
      { date: "2026-06-17", value: 2 },
      { date: "2026-06-17", value: 5 },
      { date: "2026-06-17", value: 3 },
    ], 7, NOW);
    expect(out[6].count).toBe(5);
  });

  it("is order-independent", () => {
    const a = bucketByPeak([{ date: "2026-06-17", value: 5 }, { date: "2026-06-17", value: 1 }], 7, NOW);
    const b = bucketByPeak([{ date: "2026-06-17", value: 1 }, { date: "2026-06-17", value: 5 }], 7, NOW);
    expect(a).toEqual(b);
  });

  it("zero-fills untouched days", () => {
    const out = bucketByPeak([{ date: "2026-06-17", value: 3 }], 7, NOW);
    expect(out.filter(d => d.count === 0)).toHaveLength(6);
  });

  it("drops values outside the window", () => {
    expect(bucketByPeak([{ date: "2020-01-01", value: 5 }], 7, NOW).every(d => d.count === 0)).toBe(true);
  });
});

describe("effortLevel", () => {
  it("maps each step of the scale to its own shade", () => {
    // The whole point of the absolute ramp: a 5 always looks like a 5, so an
    // all-easy month and an all-hard one cannot render identically.
    expect([1, 2, 3, 4, 5].map(effortLevel)).toEqual([1, 2, 3, 4, 5]);
  });

  it("treats absence as absence", () => {
    expect(effortLevel(0)).toBe(0);
    expect(effortLevel(-1)).toBe(0);
  });

  it("clamps above the scale rather than indexing past the ramp", () => {
    // A bad value must not produce an undefined colour class.
    expect(effortLevel(9)).toBe(EFFORT_MAX);
  });
});

describe("heatLevel", () => {
  it("gives an empty day level 0 so it reads as absence, not faint activity", () => {
    expect(heatLevel(0, 10)).toBe(0);
  });

  it("scales relative to that grid's own busiest day", () => {
    // The same count means different things in different grids: one session is
    // a quiet day against a peak of 8, and a full day against a peak of 1.
    expect(heatLevel(1, 8)).toBe(1);
    expect(heatLevel(1, 1)).toBe(4);
  });

  it("puts the quartile boundaries above the line, not on it", () => {
    expect(heatLevel(2, 8)).toBe(1); // exactly 25% — still the lowest shade
    expect(heatLevel(3, 8)).toBe(2);
    expect(heatLevel(4, 8)).toBe(2); // exactly 50%
    expect(heatLevel(5, 8)).toBe(3);
    expect(heatLevel(6, 8)).toBe(3); // exactly 75%
    expect(heatLevel(7, 8)).toBe(4);
  });

  it("never divides by zero when the whole grid is empty", () => {
    expect(heatLevel(0, 0)).toBe(0);
  });

  it("treats a negative count as absence rather than producing a negative shade", () => {
    expect(heatLevel(-3, 10)).toBe(0);
  });
});

describe("peakCount / activeDayCount", () => {
  const days: HeatmapDay[] = [
    { date: "2026-06-15", count: 0 },
    { date: "2026-06-16", count: 5 },
    { date: "2026-06-17", count: 2 },
  ];

  it("reports the busiest day", () => {
    expect(peakCount(days)).toBe(5);
  });

  it("floors the peak at 1 so an all-empty grid is still safe to divide by", () => {
    expect(peakCount([{ date: "2026-06-17", count: 0 }])).toBe(1);
    expect(peakCount([])).toBe(1);
  });

  it("counts only days with something on them", () => {
    expect(activeDayCount(days)).toBe(2);
    expect(activeDayCount([])).toBe(0);
  });
});

describe("toWeekColumns", () => {
  it("pads the first column so week columns start on Sunday", () => {
    // 2026-06-17 is a Wednesday; a 1-day window must sit in row 3 of its column
    // with three transparent pad cells above it.
    const cols = toWeekColumns(bucketByDay([], 1, NOW));
    expect(cols).toHaveLength(1);
    expect(cols[0].slice(0, 3)).toEqual([null, null, null]);
    expect(cols[0][3]?.date).toBe("2026-06-17");
  });

  it("splits a full window into seven-day columns", () => {
    const cols = toWeekColumns(bucketByDay([], 28, NOW));
    // 28 days plus the Sunday pad, rounded up to whole columns.
    expect(cols.every(c => c.length <= 7)).toBe(true);
    expect(cols.flat().filter(Boolean)).toHaveLength(28);
  });

  it("pads with null, not with zero-count days", () => {
    // A pad cell must be invisible. A zero-count day would render as a real
    // empty square and imply the learner was inactive before the window began.
    const cols = toWeekColumns(bucketByDay([], 1, NOW));
    expect(cols[0][0]).toBeNull();
  });

  it("returns nothing for an empty window instead of one blank column", () => {
    expect(toWeekColumns([])).toEqual([]);
  });
});
