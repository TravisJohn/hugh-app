import { describe, it, expect } from "vitest";
import {
  usageByFeature, combinedUsage, rankByDaysUsed, surfacesTouched, USAGE_WINDOW_DAYS,
} from "./usage";
import { MONITOR_FEATURES } from "./features";
import type { ActivityEvent } from "@/types/monitor";

const NOW = new Date("2026-06-17T12:00:00.000Z");

const ev = (feature: string, event_date: string, hits = 1): ActivityEvent =>
  ({ feature, event_date, hits });

describe("usageByFeature", () => {
  it("returns one grid per registered surface, driven by the registry not the rows", () => {
    // "Never opened" is the most useful thing this view can say, and an absent
    // row cannot say it. Every surface gets a grid whether or not it has data.
    const out = usageByFeature([], USAGE_WINDOW_DAYS, NOW);
    expect(out).toHaveLength(MONITOR_FEATURES.length);
    expect(out.map(u => u.feature.id)).toEqual(MONITOR_FEATURES.map(f => f.id));
    expect(out.every(u => u.days.length === USAGE_WINDOW_DAYS)).toBe(true);
    expect(out.every(u => u.activeDays === 0 && u.lastUsed === null)).toBe(true);
  });

  it("uses each row's own hit count rather than counting rows", () => {
    // activity_events holds one row per surface per day with a counter. Treating
    // it as one hit per row would flatten a heavy day to a light one.
    const out = usageByFeature([ev("notes", "2026-06-17", 12)], USAGE_WINDOW_DAYS, NOW);
    const notes = out.find(u => u.feature.id === "notes")!;
    expect(notes.hits).toBe(12);
    expect(notes.activeDays).toBe(1);
    expect(notes.days[notes.days.length - 1].count).toBe(12);
  });

  it("keeps each surface's activity to itself", () => {
    const out = usageByFeature(
      [ev("notes", "2026-06-17"), ev("cases", "2026-06-17"), ev("cases", "2026-06-16")],
      USAGE_WINDOW_DAYS, NOW,
    );
    expect(out.find(u => u.feature.id === "notes")!.activeDays).toBe(1);
    expect(out.find(u => u.feature.id === "cases")!.activeDays).toBe(2);
    expect(out.find(u => u.feature.id === "cloud")!.activeDays).toBe(0);
  });

  it("reports the most recent day a surface was opened", () => {
    const out = usageByFeature(
      [ev("cases", "2026-01-04"), ev("cases", "2026-05-20"), ev("cases", "2026-03-02")],
      USAGE_WINDOW_DAYS, NOW,
    );
    expect(out.find(u => u.feature.id === "cases")!.lastUsed).toBe("2026-05-20");
  });

  it("drops events from a surface that is not in the registry", () => {
    // A calendar for the legacy interview loop would resurrect a surface that
    // is deliberately off /home. Data from a surface that no longer exists is
    // dropped, not rendered under an invented heading.
    const out = usageByFeature([ev("interview", "2026-06-17", 5)], USAGE_WINDOW_DAYS, NOW);
    expect(out.every(u => u.activeDays === 0)).toBe(true);
    expect(out.map(u => u.feature.id)).not.toContain("interview");
  });

  it("drops activity older than the window rather than piling it on day one", () => {
    const out = usageByFeature([ev("notes", "2024-01-01", 9)], USAGE_WINDOW_DAYS, NOW);
    expect(out.find(u => u.feature.id === "notes")!.activeDays).toBe(0);
  });
});

describe("combinedUsage", () => {
  it("counts how many surfaces were touched that day, not how many times", () => {
    const per = usageByFeature(
      [ev("notes", "2026-06-17", 2), ev("cases", "2026-06-17", 3)],
      USAGE_WINDOW_DAYS, NOW,
    );
    const all = combinedUsage(per);
    expect(all[all.length - 1]).toEqual({ date: "2026-06-17", count: 2 });
  });

  it("is not skewed by one chatty surface", () => {
    // The reason it counts surfaces at all. Notes logs a hit per coaching
    // message and reaches ~170 in a day; drills log a handful. Summing hits let
    // a single Notes session set the maximum and flatten the rest of the year
    // to the faintest shade.
    const per = usageByFeature([
      ev("notes", "2026-06-17", 174),
      ev("cases", "2026-06-16", 2), ev("code-drill", "2026-06-16", 3),
    ], USAGE_WINDOW_DAYS, NOW);
    const all = combinedUsage(per);
    const chatty = all[all.length - 1].count;
    const varied = all[all.length - 2].count;
    expect(chatty).toBe(1);
    expect(varied).toBe(2);
    expect(varied).toBeGreaterThan(chatty);
  });

  it("never exceeds the number of registered surfaces", () => {
    const per = usageByFeature(
      MONITOR_FEATURES.map(f => ev(f.id, "2026-06-17", 50)), USAGE_WINDOW_DAYS, NOW,
    );
    const all = combinedUsage(per);
    expect(all[all.length - 1].count).toBe(MONITOR_FEATURES.length);
    expect(all.every(d => d.count <= MONITOR_FEATURES.length)).toBe(true);
  });

  it("excludes what the small grids exclude, because it is built from them", () => {
    // If "Everything" were built from the raw rows it could include a surface
    // the small grids drop, and one of the two would be lying.
    const per = usageByFeature(
      [ev("notes", "2026-06-16", 4), ev("interview", "2026-06-16", 99)],
      USAGE_WINDOW_DAYS, NOW,
    );
    const all = combinedUsage(per);
    expect(all.reduce((s, d) => s + d.count, 0)).toBe(1);
  });

  it("returns nothing for no surfaces at all", () => {
    expect(combinedUsage([])).toEqual([]);
  });
});

describe("rankByDaysUsed", () => {
  it("puts the busiest surface first", () => {
    const per = usageByFeature([
      ev("cases", "2026-06-15"), ev("cases", "2026-06-16"), ev("cases", "2026-06-17"),
      ev("notes", "2026-06-17"),
    ], USAGE_WINDOW_DAYS, NOW);
    const ranked = rankByDaysUsed(per);
    expect(ranked[0].feature.id).toBe("cases");
    expect(ranked[1].feature.id).toBe("notes");
  });

  it("keeps never-opened surfaces in the ranking", () => {
    // Dropping them would answer "what do I use" while refusing to answer
    // "what do I never touch" — the more useful half of the question.
    const per = usageByFeature([ev("notes", "2026-06-17")], USAGE_WINDOW_DAYS, NOW);
    expect(rankByDaysUsed(per)).toHaveLength(MONITOR_FEATURES.length);
  });

  it("breaks ties on registry order, so the untouched run stays findable", () => {
    const per = usageByFeature([], USAGE_WINDOW_DAYS, NOW);
    expect(rankByDaysUsed(per).map(f => f.feature.id))
      .toEqual(MONITOR_FEATURES.map(f => f.id));
  });

  it("does not mutate what it was given", () => {
    const per = usageByFeature([ev("notes", "2026-06-17")], USAGE_WINDOW_DAYS, NOW);
    const order = per.map(f => f.feature.id);
    rankByDaysUsed(per);
    expect(per.map(f => f.feature.id)).toEqual(order);
  });
});

describe("surfacesTouched", () => {
  it("counts the surfaces opened at least once", () => {
    const per = usageByFeature(
      [ev("notes", "2026-06-17"), ev("cases", "2026-06-17")], USAGE_WINDOW_DAYS, NOW,
    );
    expect(surfacesTouched(per)).toBe(2);
  });

  it("is zero on an empty account", () => {
    expect(surfacesTouched(usageByFeature([], USAGE_WINDOW_DAYS, NOW))).toBe(0);
  });
});
