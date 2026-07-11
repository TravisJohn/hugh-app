import { describe, it, expect } from "vitest";
import {
  buildCriteria,
  renderCriteriaForPrompt,
  prepareDiaryContext,
  MASTERY_RUBRIC,
  PASS_THRESHOLD,
} from "./criteria";

describe("buildCriteria", () => {
  it("builds authoritative concepts from the card's learning points", () => {
    const c = buildCriteria({
      title: "BigQuery partitioning",
      summary: "Partition large tables by date to prune scans.",
      learningPoints: [
        { id: "1", text: "Partitioning prunes scanned data" },
        { id: "2", text: "Clustering orders within partitions" },
        { id: "3", text: "  " }, // blank → dropped
      ],
    });
    expect(c.concepts).toEqual([
      "Partitioning prunes scanned data",
      "Clustering orders within partitions",
    ]);
    expect(c.summary).toContain("prune scans");
    expect(c.passThreshold).toBe(PASS_THRESHOLD);
    expect(c.rubric).toBe(MASTERY_RUBRIC);
  });

  it("tolerates a card with no learning points", () => {
    const c = buildCriteria({ title: "T", summary: null, learningPoints: null });
    expect(c.concepts).toEqual([]);
    expect(c.summary).toBe("");
  });
});

describe("renderCriteriaForPrompt", () => {
  it("embeds concepts, summary, and the rubric verbatim", () => {
    const c = buildCriteria({
      title: "BigQuery partitioning",
      summary: "Prune by date.",
      learningPoints: [{ id: "1", text: "Partition pruning" }],
    });
    const out = renderCriteriaForPrompt(c);
    expect(out).toContain("BigQuery partitioning");
    expect(out).toContain("Partition pruning");
    expect(out).toContain("Prune by date.");
    expect(out).toContain("Apply it to a new, unseen scenario");
    expect(out).toMatch(/authoritative/i);
  });

  it("still asks to assess when there are no learning points", () => {
    const c = buildCriteria({ title: "T", summary: "", learningPoints: [] });
    expect(renderCriteriaForPrompt(c)).toMatch(/general understanding/i);
  });
});

describe("prepareDiaryContext", () => {
  it("caps length and marks truncation", () => {
    const long = "x".repeat(5000);
    const out = prepareDiaryContext([{ title: "n", body: long }], 100);
    expect(out.length).toBeLessThan(200);
    expect(out).toMatch(/truncated/);
  });

  it("returns empty string for no usable entries", () => {
    expect(prepareDiaryContext([], 100)).toBe("");
    expect(prepareDiaryContext([{ body: "   " }], 100)).toBe("");
  });
});
