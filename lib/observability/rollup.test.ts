import { describe, it, expect } from "vitest";
import {
  percentile,
  rollupOperations,
  silentFailures,
  buildCoverage,
  totals,
  chatHealth,
  CHAT_ANOMALY_THRESHOLD,
  CHAT_MIN_SAMPLE,
  type OperationEventRow,
} from "./rollup";
import { OPERATIONS } from "./operations";

function row(over: Partial<OperationEventRow> = {}): OperationEventRow {
  return {
    operation:   "track.build",
    outcome:     "ok",
    duration_ms: 1000,
    error_class: null,
    ...over,
  };
}

// ── percentile ──────────────────────────────────────────────────────────────

describe("percentile - nearest rank", () => {
  it("returns null for no measurements, rather than zero", () => {
    // "No measurements" and "instant" are different facts, and a zero here
    // would read as a suspiciously fast operation.
    expect(percentile([], 50)).toBeNull();
  });

  it("returns the only value when there is one", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it("computes p50 and p95 over a known set", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 100)).toBe(100);
  });

  it("does not care what order the values arrive in", () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(5);
  });

  it("ignores non-finite values instead of poisoning the result", () => {
    expect(percentile([1, 2, NaN, 3, Infinity], 50)).toBe(2);
  });
});

// ── rollupOperations ────────────────────────────────────────────────────────

describe("rollupOperations - iterates the registry, not the rows", () => {
  it("returns one entry per registered operation, in registry order", () => {
    const stats = rollupOperations([]);
    expect(stats.map(s => s.id)).toEqual(OPERATIONS.map(o => o.id));
  });

  it("reports an operation with no rows as honest zeroes rather than omitting it", () => {
    // A missing row is a finding. An operation that vanishes from the panel
    // when it stops being recorded is the opposite of observability.
    const stats = rollupOperations([]);
    const build = stats.find(s => s.id === "track.build")!;

    expect(build.attempts).toBe(0);
    expect(build.failureRate).toBeNull();
    expect(build.p50DurationMs).toBeNull();
  });

  it("ignores an unknown operation id sitting in the table", () => {
    // A renamed or retired id must not invent a column nobody can interpret.
    const stats = rollupOperations([row({ operation: "track.teleport" })]);
    expect(stats.reduce((n, s) => n + s.attempts, 0)).toBe(0);
  });

  it("counts the three outcomes separately", () => {
    const stats = rollupOperations([
      row({ outcome: "ok" }),
      row({ outcome: "ok" }),
      row({ outcome: "failed" }),
      row({ outcome: "refused" }),
      row({ outcome: "refused" }),
      row({ outcome: "refused" }),
    ]);
    const build = stats.find(s => s.id === "track.build")!;

    expect(build.attempts).toBe(6);
    expect(build.ok).toBe(2);
    expect(build.failed).toBe(1);
    expect(build.refused).toBe(3);
  });
});

describe("failureRate - refusals are not failures", () => {
  it("excludes refusals from the denominator", () => {
    // 1 failed out of 2 decisive attempts is 50%, even though 10 of the 12
    // rows are refusals. Including them would report 8%, and a wave of
    // off-domain topics would hide a genuinely broken operation.
    const rows = [
      row({ outcome: "ok" }),
      row({ outcome: "failed" }),
      ...Array.from({ length: 10 }, () => row({ outcome: "refused" })),
    ];
    const build = rollupOperations(rows).find(s => s.id === "track.build")!;

    expect(build.failureRate).toBe(0.5);
  });

  it("does not let a spike in refusals move the failure rate at all", () => {
    const base = [row({ outcome: "ok" }), row({ outcome: "ok" }), row({ outcome: "failed" })];
    const withRefusals = [...base, ...Array.from({ length: 500 }, () => row({ outcome: "refused" }))];

    const a = rollupOperations(base).find(s => s.id === "track.build")!.failureRate;
    const b = rollupOperations(withRefusals).find(s => s.id === "track.build")!.failureRate;

    expect(a).toBe(b);
  });

  it("is null when every row was a refusal, not zero", () => {
    // Zero would claim a perfect success record for something that never
    // succeeded, because it never ran.
    const rows = [row({ outcome: "refused" }), row({ outcome: "refused" })];
    expect(rollupOperations(rows).find(s => s.id === "track.build")!.failureRate).toBeNull();
  });

  it("reports 1 when everything decisive failed", () => {
    const rows = [row({ outcome: "failed" }), row({ outcome: "failed" })];
    expect(rollupOperations(rows).find(s => s.id === "track.build")!.failureRate).toBe(1);
  });
});

describe("durations", () => {
  it("excludes rows with no duration rather than counting them as zero", () => {
    // A refusal that happened before any work started has nothing to time.
    // Counting it as 0ms would drag every percentile towards nothing.
    const rows = [
      row({ duration_ms: null, outcome: "refused" }),
      row({ duration_ms: 1000 }),
      row({ duration_ms: 3000 }),
    ];
    const build = rollupOperations(rows).find(s => s.id === "track.build")!;

    expect(build.p50DurationMs).toBe(1000);
    expect(build.p95DurationMs).toBe(3000);
  });

  it("measures durations from failures too, not just successes", () => {
    // How long a build takes to fail is exactly as interesting as how long it
    // takes to succeed - a slow failure is a timeout, a fast one is a refusal
    // in disguise.
    const rows = [row({ outcome: "failed", duration_ms: 500 })];
    expect(rollupOperations(rows).find(s => s.id === "track.build")!.p50DurationMs).toBe(500);
  });
});

describe("topErrorClasses", () => {
  it("counts only failed rows, most frequent first", () => {
    const rows = [
      row({ outcome: "failed", error_class: "TrackGenerationError" }),
      row({ outcome: "failed", error_class: "TrackGenerationError" }),
      row({ outcome: "failed", error_class: "TypeError" }),
      row({ outcome: "ok",     error_class: "ShouldNotCount" }),
      row({ outcome: "refused", error_class: "AlsoShouldNotCount" }),
    ];
    const build = rollupOperations(rows).find(s => s.id === "track.build")!;

    expect(build.topErrorClasses).toEqual([
      { errorClass: "TrackGenerationError", count: 2 },
      { errorClass: "TypeError",            count: 1 },
    ]);
  });

  it("labels a failure with no class rather than dropping it", () => {
    const rows = [row({ outcome: "failed", error_class: null })];
    expect(rollupOperations(rows).find(s => s.id === "track.build")!.topErrorClasses)
      .toEqual([{ errorClass: "UnknownError", count: 1 }]);
  });

  it("breaks ties alphabetically so the panel does not reshuffle between loads", () => {
    const rows = [
      row({ outcome: "failed", error_class: "Zeta" }),
      row({ outcome: "failed", error_class: "Alpha" }),
    ];
    expect(
      rollupOperations(rows).find(s => s.id === "track.build")!.topErrorClasses.map(e => e.errorClass),
    ).toEqual(["Alpha", "Zeta"]);
  });

  it("honours the limit", () => {
    const rows = ["A", "B", "C", "D"].map(c => row({ outcome: "failed", error_class: c }));
    expect(rollupOperations(rows, 2).find(s => s.id === "track.build")!.topErrorClasses).toHaveLength(2);
  });
});

// ── silentFailures ──────────────────────────────────────────────────────────

describe("silentFailures - the ones nobody complained about", () => {
  it("surfaces topic.gate when its classifier failed", () => {
    // The learner saw nothing: the gate failed open and their topic went
    // through. Nobody will ever report this, so the panel has to.
    const stats = rollupOperations([
      { operation: "topic.gate", outcome: "failed", duration_ms: 300, error_class: "classifier-unavailable" },
    ]);
    expect(silentFailures(stats).map(s => s.id)).toEqual(["topic.gate"]);
  });

  it("stays quiet when the silent operation is healthy", () => {
    const stats = rollupOperations([
      { operation: "topic.gate", outcome: "ok",      duration_ms: 300, error_class: null },
      { operation: "topic.gate", outcome: "refused", duration_ms: 280, error_class: null },
    ]);
    expect(silentFailures(stats)).toEqual([]);
  });

  it("does not list loud failures, which already have someone complaining", () => {
    const stats = rollupOperations([
      { operation: "track.build", outcome: "failed", duration_ms: 900, error_class: "TrackGenerationError" },
    ]);
    expect(silentFailures(stats)).toEqual([]);
  });
});

// ── buildCoverage ───────────────────────────────────────────────────────────

describe("buildCoverage - attempts nobody heard about", () => {
  it("is complete when every goal produced a recorded build", () => {
    expect(buildCoverage(10, 10)).toEqual({
      goalsCreated: 10, recordedBuilds: 10, unrecorded: 0, complete: true, state: "complete",
    });
  });

  it("reports the shortfall when after() died before recording anything", () => {
    // Neither the server row nor the beacon arrived. This subtraction is the
    // only evidence such an attempt ever existed.
    const coverage = buildCoverage(10, 7);
    expect(coverage.unrecorded).toBe(3);
    expect(coverage.complete).toBe(false);
  });

  it("treats more builds than goals as complete, not as an error", () => {
    // Goals deleted after their builds were recorded. Nothing is missing.
    const coverage = buildCoverage(5, 8);
    expect(coverage.unrecorded).toBe(-3);
    expect(coverage.complete).toBe(true);
  });

  it("is complete when nothing has happened yet", () => {
    expect(buildCoverage(0, 0).complete).toBe(true);
  });
});

// ── totals ──────────────────────────────────────────────────────────────────

describe("totals", () => {
  it("recomputes the rate from counts rather than averaging the rates", () => {
    // A mean of per-operation rates weights a 2-attempt operation the same as
    // a 1000-attempt one. Here: one operation is 100% failed over 1 attempt,
    // another is 0% failed over 99. The mean of the rates is 50%; the truth
    // is 1%.
    const stats = rollupOperations([
      { operation: "quiz.generate", outcome: "failed", duration_ms: null, error_class: "X" },
      ...Array.from({ length: 99 }, () => row({ outcome: "ok" })),
    ]);
    expect(totals(stats).failureRate).toBeCloseTo(0.01, 5);
  });

  it("sums every outcome across operations", () => {
    const stats = rollupOperations([
      row({ outcome: "ok" }),
      { operation: "ask.chat", outcome: "refused", duration_ms: null, error_class: null },
      { operation: "topic.gate", outcome: "failed", duration_ms: 10, error_class: "classifier-unavailable" },
    ]);
    expect(totals(stats)).toMatchObject({ attempts: 3, ok: 1, failed: 1, refused: 1 });
  });

  it("returns a null rate when nothing decisive happened", () => {
    expect(totals(rollupOperations([])).failureRate).toBeNull();
  });
});

// ── chatHealth ──────────────────────────────────────────────────────────────

describe("chatHealth - one number for the noisiest operation", () => {
  const chat = (ok: number, failed: number) =>
    rollupOperations([
      ...Array.from({ length: ok },     () => row({ operation: "ask.chat", outcome: "ok" })),
      ...Array.from({ length: failed }, () => row({ operation: "ask.chat", outcome: "failed" })),
    ]).find(s => s.id === "ask.chat")!;

  it("says no-data before anything has happened", () => {
    expect(chatHealth(chat(0, 0))).toBe("no-data");
  });

  it("says no-data when the stats are missing entirely", () => {
    expect(chatHealth(undefined)).toBe("no-data");
  });

  it("refuses to judge a sample too small to mean anything", () => {
    // 1 failure in 3 is 33%, which would light the panel red on a quiet
    // afternoon and teach the operator to stop looking at it.
    expect(chatHealth(chat(2, 1))).toBe("too-few");
  });

  it("starts judging once the sample is large enough", () => {
    expect(chatHealth(chat(CHAT_MIN_SAMPLE, 0))).toBe("normal");
  });

  it("reads a healthy rate as normal", () => {
    // 1 failure in 200 = 0.5%.
    expect(chatHealth(chat(199, 1))).toBe("normal");
  });

  it("treats exactly the threshold as normal, not an anomaly", () => {
    // 1 in 100 is exactly 1%. Flipping here would make the panel oscillate on
    // a single request either side of a round number.
    const stats = chat(99, 1);
    expect(stats.failureRate).toBe(CHAT_ANOMALY_THRESHOLD);
    expect(chatHealth(stats)).toBe("normal");
  });

  it("flags a rate above the threshold as an anomaly", () => {
    // 2 in 100 = 2%.
    expect(chatHealth(chat(98, 2))).toBe("anomaly");
  });

  it("ignores refusals when deciding, like every other rate here", () => {
    const stats = rollupOperations([
      ...Array.from({ length: 100 }, () => row({ operation: "ask.chat", outcome: "ok" })),
      ...Array.from({ length: 900 }, () => row({ operation: "ask.chat", outcome: "refused" })),
    ]).find(s => s.id === "ask.chat")!;

    // 1000 attempts, but only 100 decisive - and none of them failed.
    expect(chatHealth(stats)).toBe("normal");
  });

  it("says too-few when refusals inflate the volume but the sample is thin", () => {
    const stats = rollupOperations([
      ...Array.from({ length: 5 },   () => row({ operation: "ask.chat", outcome: "ok" })),
      ...Array.from({ length: 500 }, () => row({ operation: "ask.chat", outcome: "refused" })),
    ]).find(s => s.id === "ask.chat")!;

    expect(stats.attempts).toBe(505);
    expect(chatHealth(stats)).toBe("too-few");
  });
});

describe("buildCoverage - no telemetry is not the same as no problem", () => {
  it("reports no-telemetry before the first event exists", () => {
    // Every goal predates instrumentation, so none of them could have a build
    // on record. Calling that 5 ghost builds would open the dashboard on a red
    // alarm the day it ships and teach the operator to ignore it.
    const coverage = buildCoverage(5, 0, false);

    expect(coverage.state).toBe("no-telemetry");
    expect(coverage.unrecorded).toBe(0);
    expect(coverage.complete).toBe(true);
  });

  it("still reports the raw counts while in no-telemetry", () => {
    // The operator should be able to see why nothing is being compared.
    const coverage = buildCoverage(5, 0, false);
    expect(coverage.goalsCreated).toBe(5);
    expect(coverage.recordedBuilds).toBe(0);
  });

  it("labels a clean comparison complete", () => {
    expect(buildCoverage(10, 10, true).state).toBe("complete");
  });

  it("labels a shortfall as a gap", () => {
    expect(buildCoverage(10, 7, true).state).toBe("gap");
  });

  it("defaults to having telemetry, so existing callers are unchanged", () => {
    expect(buildCoverage(10, 7).state).toBe("gap");
  });
});
