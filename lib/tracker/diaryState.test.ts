import { describe, it, expect } from "vitest";
import { diaryState, canStartFromDiary, type DiaryState } from "./diaryState";

const state = (over: Partial<Parameters<typeof diaryState>[0]> = {}): DiaryState =>
  diaryState({ loading: false, failed: false, count: 0, ...over });

describe("diaryState - a failed read is not an empty diary", () => {
  it("reads a refused load as failed, not empty, when no entries came back", () => {
    // The whole defect in one assertion: before this module, a 500 and a
    // genuinely blank diary both arrived as `entries.length === 0`.
    expect(state({ failed: true, count: 0 })).toBe("failed");
  });

  it("reads a successful load with no entries as empty", () => {
    expect(state({ count: 0 })).toBe("empty");
  });

  it("reads a successful load with entries as ready", () => {
    expect(state({ count: 3 })).toBe("ready");
  });
});

describe("diaryState - precedence between the three conditions", () => {
  it("reports a load still in flight as loading even if the last one failed", () => {
    // A retry sets loading before clearing the old failure; the learner should
    // see the spinner, not the error they are already retrying.
    expect(state({ loading: true, failed: true })).toBe("loading");
  });

  it("reports a load still in flight as loading rather than empty", () => {
    expect(state({ loading: true, count: 0 })).toBe("loading");
  });

  it("still reports failed when entries are held over from an earlier load", () => {
    // Not reachable from today's panel, which clears entries on open. Asserted
    // so a future caller that keeps them cannot silently turn a failure into a
    // stale-but-confident render.
    expect(state({ failed: true, count: 5 })).toBe("failed");
  });
});

describe("canStartFromDiary - what the quiz and mastery gates may offer", () => {
  it("opens the gate only when the diary actually loaded and has entries", () => {
    expect(canStartFromDiary("ready")).toBe(true);
  });

  it("keeps the gate shut when the diary could not be read", () => {
    // A quiz is generated from diary entries. Opening this gate on a diary we
    // failed to load would build a quiz from nothing.
    expect(canStartFromDiary("failed")).toBe(false);
  });

  it("keeps the gate shut while loading and when genuinely empty", () => {
    expect(canStartFromDiary("loading")).toBe(false);
    expect(canStartFromDiary("empty")).toBe(false);
  });
});
