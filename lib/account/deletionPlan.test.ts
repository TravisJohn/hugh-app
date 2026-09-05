import { describe, it, expect } from "vitest";
import {
  DELETION_ORDER, USER_BUCKETS, LEARNER_CONTENT_COLUMNS, REDACTED_TOPIC,
  storagePrefix, generationsRedaction, summariseDeletion,
} from "./deletionPlan";

/**
 * These tests exist because a deletion that half-works is worse than one that
 * fails: it reports success, the learner believes their data is gone, and the
 * privacy policy that describes it becomes untrue. Each case names the way
 * something would survive.
 */

describe("DELETION_ORDER", () => {
  it("deletes the auth user last, because the cascade destroys the handle", () => {
    // Once the row is gone, track_generations.user_id is already NULL and the
    // storage sweep has no id to sweep by. Deleting first is not a slower
    // version of this order — it is one that cannot work at all.
    expect(DELETION_ORDER[DELETION_ORDER.length - 1]).toBe("delete-auth-user");
  });

  it("removes the two things the cascade cannot reach, before it runs", () => {
    const authAt = DELETION_ORDER.indexOf("delete-auth-user");
    expect(DELETION_ORDER.indexOf("purge-storage")).toBeLessThan(authAt);
    expect(DELETION_ORDER.indexOf("redact-generations")).toBeLessThan(authAt);
  });

  it("lists each step exactly once, so none can be silently skipped or repeated", () => {
    expect(new Set(DELETION_ORDER).size).toBe(DELETION_ORDER.length);
  });
});

describe("USER_BUCKETS", () => {
  it("covers both buckets keyed by user id", () => {
    // Missing one leaves real files — screenshots or résumés — in place after
    // the account is gone, with nothing left pointing at them.
    expect([...USER_BUCKETS].sort()).toEqual(["monitor-documents", "note-images"]);
  });
});

describe("storagePrefix", () => {
  it("ends in a slash so it cannot match a different id that starts the same", () => {
    expect(storagePrefix("abc")).toBe("abc/");
  });
});

describe("generationsRedaction", () => {
  it("redacts every column listed as learner content", () => {
    // The guard that matters: adding a text column to track_generations without
    // adding it here is how a future change quietly starts surviving deletion.
    const patch = generationsRedaction();
    for (const column of LEARNER_CONTENT_COLUMNS) {
      expect(Object.keys(patch)).toContain(column);
    }
  });

  it("replaces the typed topic rather than leaving it", () => {
    // 048 keeps this row on purpose, de-identified. input_topic is the
    // learner's own words, so de-identified means this column changes.
    expect(generationsRedaction().input_topic).toBe(REDACTED_TOPIC);
    expect(generationsRedaction().milestones_out).toBeNull();
  });

  it("marks the row as no longer having its input", () => {
    // The replay harness selects WHERE input_intact. Without this the row
    // still looks complete and the eval silently reads a redacted topic.
    expect(generationsRedaction().input_intact).toBe(false);
  });

  it("keeps the numbers, which are what survive a deletion by design", () => {
    // answer_chars / context_uptake / milestone_count are not personal data and
    // are the reason 048 recorded them apart from the text. Redacting them
    // would blind the eval for no privacy gain.
    const patch = Object.keys(generationsRedaction());
    for (const kept of ["answer_chars", "context_uptake", "milestone_count", "generation_ms"]) {
      expect(patch).not.toContain(kept);
    }
  });
});

describe("summariseDeletion", () => {
  it("reports what was actually removed, not just that it succeeded", () => {
    const line = summariseDeletion({
      userId: "u1", storageObjects: 12, generationsRedacted: 3,
    });
    expect(line).toContain("u1");
    expect(line).toContain("12");
    expect(line).toContain("3");
  });
});
