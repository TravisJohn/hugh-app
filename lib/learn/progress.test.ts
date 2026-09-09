import { describe, it, expect } from "vitest";
import { regionProgress, goalsInFlight, MAX_ORBITS } from "./progress";

describe("regionProgress — the shape of what a learner has actually built", () => {
  it("reports nothing for a learner with nothing", () => {
    expect(regionProgress([], [])).toEqual({});
  });

  it("lights a region fully when every milestone in it is mastered", () => {
    const p = regionProgress(
      [{ id: "g1", region: "ml" }],
      [{ goalId: "g1", mastered: true }, { goalId: "g1", mastered: true }],
    );
    expect(p).toEqual({ ml: 1 });
  });

  it("counts mastery, not movement", () => {
    const p = regionProgress(
      [{ id: "g1", region: "stats" }],
      [
        { goalId: "g1", mastered: true },
        { goalId: "g1", mastered: false },
        { goalId: "g1", mastered: false },
        { goalId: "g1", mastered: false },
      ],
    );
    expect(p.stats).toBeCloseTo(0.25, 6);
  });

  it("adds several goals in one region together", () => {
    // Three small tracks in a region should light it as much as one large one.
    const p = regionProgress(
      [{ id: "a", region: "cloud" }, { id: "b", region: "cloud" }],
      [
        { goalId: "a", mastered: true },
        { goalId: "b", mastered: true },
        { goalId: "b", mastered: false },
      ],
    );
    expect(p.cloud).toBeCloseTo(2 / 3, 6);
  });

  it("keeps regions apart, so work in one never lights another", () => {
    const p = regionProgress(
      [{ id: "a", region: "ml" }, { id: "b", region: "analytics" }],
      [{ goalId: "a", mastered: true }, { goalId: "b", mastered: false }],
    );
    expect(p.ml).toBe(1);
    expect(p.analytics).toBe(0);
  });

  it("ignores a goal that was never filed, rather than guessing where it goes", () => {
    // Every goal created before migration 051 is in this state. Putting that
    // history in the wrong region is worse than leaving it uncounted.
    const p = regionProgress(
      [{ id: "old", region: null }],
      [{ goalId: "old", mastered: true }],
    );
    expect(p).toEqual({});
  });

  it("drops a region name the app does not recognise", () => {
    // The value came from a language model. If the region list is ever edited,
    // rows filed under a retired name must not light a cluster that is gone.
    const p = regionProgress(
      [{ id: "g", region: "underwater-basket-weaving" }],
      [{ goalId: "g", mastered: true }],
    );
    expect(p).toEqual({});
  });

  it("omits a region whose track has no milestones yet, rather than calling it zero", () => {
    // A track that failed to generate has no milestones. "Nothing to master"
    // and "mastered none of it" are different facts.
    const p = regionProgress([{ id: "g", region: "ml" }], []);
    expect(p).not.toHaveProperty("ml");
  });

  it("ignores milestones belonging to a goal it was not given", () => {
    // The two queries are separate, so they can disagree — a goal deleted
    // between them must not crash or land its milestones somewhere arbitrary.
    const p = regionProgress(
      [{ id: "a", region: "ml" }],
      [{ goalId: "ghost", mastered: true }, { goalId: "a", mastered: true }],
    );
    expect(p).toEqual({ ml: 1 });
  });
});

const READY = "ready";

describe("goalsInFlight — what the learner is on right now", () => {
  it("returns a filed, unfinished goal", () => {
    const out = goalsInFlight(
      [{ id: "g", topic: "Apache Airflow", region: "automation", trackStatus: READY }],
      [{ goalId: "g", mastered: false }],
    );
    expect(out).toEqual([{ id: "g", topic: "Apache Airflow", region: "automation" }]);
  });

  it("counts a track that is still building, because the learner has committed to it", () => {
    const out = goalsInFlight(
      [{ id: "g", topic: "RAG systems", region: "ml", trackStatus: "pending" }],
      [],
    );
    expect(out).toHaveLength(1);
  });

  it("drops a goal that was never filed — there is no cluster for it to orbit", () => {
    const out = goalsInFlight(
      [{ id: "g", topic: "Old goal", region: null, trackStatus: READY }],
      [],
    );
    expect(out).toEqual([]);
  });

  it("drops a failed track, so a broken build cannot hide behind a nice animation", () => {
    const out = goalsInFlight(
      [{ id: "g", topic: "Linear regression", region: "ml", trackStatus: "failed" }],
      [{ goalId: "g", mastered: false }],
    );
    expect(out).toEqual([]);
  });

  it("drops a fully mastered goal — finished work lights the region instead", () => {
    const out = goalsInFlight(
      [{ id: "g", topic: "Done", region: "stats", trackStatus: READY }],
      [{ goalId: "g", mastered: true }, { goalId: "g", mastered: true }],
    );
    expect(out).toEqual([]);
  });

  it("keeps a goal that is only partly mastered", () => {
    const out = goalsInFlight(
      [{ id: "g", topic: "Halfway", region: "stats", trackStatus: READY }],
      [{ goalId: "g", mastered: true }, { goalId: "g", mastered: false }],
    );
    expect(out).toHaveLength(1);
  });

  it("caps the number shown, keeping the ones it was given first", () => {
    const many = Array.from({ length: MAX_ORBITS + 4 }, (_, i) => ({
      id: `g${i}`, topic: `Topic ${i}`, region: "ml", trackStatus: READY,
    }));
    const out = goalsInFlight(many, []);
    expect(out).toHaveLength(MAX_ORBITS);
    expect(out[0]!.id).toBe("g0");
  });

  it("does not let a skipped goal use up a slot", () => {
    // The cap counts what is shown, not what was considered. An unfiled goal
    // in the middle of the list must not silently push a real one out.
    const goals = [
      { id: "skip", topic: "Unfiled", region: null, trackStatus: READY },
      ...Array.from({ length: MAX_ORBITS }, (_, i) => ({
        id: `g${i}`, topic: `T${i}`, region: "ml", trackStatus: READY,
      })),
    ];
    expect(goalsInFlight(goals, [])).toHaveLength(MAX_ORBITS);
  });
});
