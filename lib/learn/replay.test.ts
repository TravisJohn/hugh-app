import { describe, it, expect } from "vitest";
import {
  ANSWER_CHAR_BUCKETS,
  bucketFor,
  compareArms,
  distinctFingerprints,
  dropMissingAnswers,
  estimateReplayCost,
  excludeAlreadyReplayed,
  replayEligibility,
  replayKey,
  replayModelFor,
  selectReplayable,
  summariseArm,
  type GenerationRow,
} from "./replay";

/**
 * A replayable baseline row. Every test starts from something valid and breaks
 * exactly one thing, so a failure names the rule it broke.
 */
const row = (over: Partial<GenerationRow> = {}): GenerationRow => ({
  id:                 "gen-1",
  user_id:            "user-1",
  goal_id:            "goal-1",
  source_kind:        "qa",
  model:              "claude-sonnet-4-6",
  prompt_fingerprint: "3309ed3a3d9d3926",
  input_topic:        "dbt incremental models",
  answer_chars:       300,
  context_uptake:     0.4,
  milestone_count:    8,
  outcome:            "ok",
  tokens_in:          3000,
  tokens_out:         2000,
  is_replay:          false,
  context_used:       false,
  ...over,
});

describe("replayEligibility - which generations can serve as a baseline", () => {
  it("accepts an ordinary successful QA generation", () => {
    expect(replayEligibility(row())).toEqual({ ok: true });
  });

  it("refuses a document generation, because its input no longer exists", () => {
    // The approve route deletes the extracted text once it has been read, so
    // re-running from input_topic alone would send the QA prompt where the
    // original sent the document prompt - a different fingerprint entirely.
    expect(replayEligibility(row({ source_kind: "document" }))).toEqual({
      ok: false,
      reason: "document-source",
    });
  });

  it("refuses a replay, so an experiment cannot become its own baseline", () => {
    expect(replayEligibility(row({ is_replay: true }))).toEqual({
      ok: false,
      reason: "already-a-replay",
    });
  });

  it("refuses a failed generation, which has no curriculum to compare against", () => {
    expect(replayEligibility(row({ outcome: "failed" }))).toEqual({
      ok: false,
      reason: "generation-failed",
    });
  });

  it("refuses a row whose topic is blank or whitespace, not just empty", () => {
    expect(replayEligibility(row({ input_topic: "   " }))).toEqual({
      ok: false,
      reason: "no-topic",
    });
  });

  it("reports the replay reason before the document reason for a replayed document", () => {
    // Both are true; the order matters only so the skip counts are stable and
    // an operator reading them is not told a different story between runs.
    expect(replayEligibility(row({ is_replay: true, source_kind: "document" }))).toEqual({
      ok: false,
      reason: "already-a-replay",
    });
  });
});

describe("selectReplayable - the limit bounds replays, not candidates", () => {
  it("applies the limit after filtering, so N means N real replays", () => {
    const rows = [
      row({ id: "a", source_kind: "document" }),
      row({ id: "b" }),
      row({ id: "c", outcome: "failed" }),
      row({ id: "d" }),
      row({ id: "e" }),
    ];
    const selection = selectReplayable(rows, 2);

    expect(selection.eligible.map(r => r.id)).toEqual(["b", "d"]);
    expect(selection.eligibleFound).toBe(3);
  });

  it("counts every skipped row by reason so nothing is dropped silently", () => {
    const rows = [
      row({ source_kind: "document" }),
      row({ source_kind: "document" }),
      row({ outcome: "failed" }),
      row(),
    ];
    const selection = selectReplayable(rows, 10);

    expect(selection.skipped).toEqual(
      expect.arrayContaining([
        { reason: "document-source", count: 2 },
        { reason: "generation-failed", count: 1 },
      ]),
    );
  });

  it("reports eligibleFound above the limit, so a truncated run is visible", () => {
    const selection = selectReplayable([row(), row(), row()], 1);
    expect(selection.eligible).toHaveLength(1);
    expect(selection.eligibleFound).toBe(3);
  });

  it("treats a negative limit as zero rather than slicing from the end", () => {
    expect(selectReplayable([row(), row()], -1).eligible).toHaveLength(0);
  });

  it("returns no skips and no rows for an empty corpus", () => {
    const selection = selectReplayable([], 10);
    expect(selection.eligible).toHaveLength(0);
    expect(selection.eligibleFound).toBe(0);
    expect(selection.skipped).toEqual([]);
  });
});

describe("estimateReplayCost - the only warning before invisible spend", () => {
  it("prices the run at the REPLAY model's rate, not the model that ran first", () => {
    // The whole point: 3000 in / 2000 out on Haiku is 1*3000/1e6 + 5*2000/1e6.
    const cost = estimateReplayCost([row()], "claude-haiku-4-5");
    expect(cost).toBeCloseTo(0.003 + 0.01, 10);
  });

  it("prices the same row higher on Sonnet, which is what makes the case", () => {
    const haiku  = estimateReplayCost([row()], "claude-haiku-4-5");
    const sonnet = estimateReplayCost([row()], "claude-sonnet-4-6");
    expect(sonnet).toBeGreaterThan(haiku);
  });

  it("sums across rows rather than pricing an aggregate", () => {
    const one  = estimateReplayCost([row()], "claude-haiku-4-5");
    const four = estimateReplayCost([row(), row(), row(), row()], "claude-haiku-4-5");
    expect(four).toBeCloseTo(one * 4, 10);
  });

  it("costs nothing when there is nothing to replay", () => {
    expect(estimateReplayCost([], "claude-haiku-4-5")).toBe(0);
  });

  it("over-states rather than hides the cost of an unknown model", () => {
    // lib/pricing falls back to the most expensive Claude rate on purpose.
    const unknown = estimateReplayCost([row()], "some-model-we-have-not-priced");
    const sonnet  = estimateReplayCost([row()], "claude-sonnet-4-6");
    expect(unknown).toBeCloseTo(sonnet, 10);
  });
});

describe("distinctFingerprints - a prompt change must not masquerade as a model change", () => {
  it("returns one fingerprint when every row shares a prompt", () => {
    expect(distinctFingerprints([row(), row()])).toEqual(["3309ed3a3d9d3926"]);
  });

  it("surfaces a mixed set so the caller can refuse to average two prompts", () => {
    const mixed = distinctFingerprints([row(), row({ prompt_fingerprint: "eb74a8bd940e372b" })]);
    expect(mixed).toHaveLength(2);
  });

  it("returns nothing for no rows", () => {
    expect(distinctFingerprints([])).toEqual([]);
  });
});

/** The key a run would compute for a row, at one fixed target model. */
const keyAt = (model: string) => (r: GenerationRow) => replayKey(r.goal_id ?? "", model);

describe("excludeAlreadyReplayed - a second run must not pay twice, invisibly", () => {
  it("skips a baseline whose goal has already been replayed at this model", () => {
    const rows = [row({ id: "a", goal_id: "goal-1" }), row({ id: "b", goal_id: "goal-2" })];
    const result = excludeAlreadyReplayed(rows, new Set([replayKey("goal-1", "claude-haiku-4-5")]), keyAt("claude-haiku-4-5"));

    expect(result.fresh.map(r => r.id)).toEqual(["b"]);
    expect(result.alreadyDone).toBe(1);
  });

  it("keeps everything when nothing has been replayed yet", () => {
    const rows = [row({ goal_id: "goal-1" }), row({ goal_id: "goal-2" })];
    expect(excludeAlreadyReplayed(rows, new Set(), keyAt("claude-haiku-4-5")).fresh).toHaveLength(2);
  });

  it("treats a row with no goal as fresh, since it cannot be matched", () => {
    const rows = [row({ id: "orphan", goal_id: null })];
    const result = excludeAlreadyReplayed(rows, new Set([replayKey("goal-1", "claude-haiku-4-5")]), keyAt("claude-haiku-4-5"));
    expect(result.fresh.map(r => r.id)).toEqual(["orphan"]);
    expect(result.alreadyDone).toBe(0);
  });

  it("marks every baseline of a retried goal done together, erring toward not spending", () => {
    // Two baselines share a goal because the track was retried. Matching is by
    // goal_id, so one replay covers both - the safe direction for a default
    // whose spend never reaches usage_logs.
    const rows = [row({ id: "first", goal_id: "goal-1" }), row({ id: "second", goal_id: "goal-1" })];
    expect(
      excludeAlreadyReplayed(rows, new Set([replayKey("goal-1", "claude-haiku-4-5")]), keyAt("claude-haiku-4-5")).fresh,
    ).toHaveLength(0);
  });

  it("does not let a replay at one model mask a pending one at another", () => {
    // The bug the model half of the key exists to stop. A context run replays
    // each baseline at its own model, so one fingerprint can legitimately span
    // models - keying on the goal alone would silently retire them all.
    const rows = [row({ id: "a", goal_id: "goal-1", model: "claude-sonnet-4-6" })];
    const doneAtHaiku = new Set([replayKey("goal-1", "claude-haiku-4-5")]);

    expect(excludeAlreadyReplayed(rows, doneAtHaiku, r => replayKey(r.goal_id ?? "", r.model)).fresh)
      .toHaveLength(1);
  });
});

describe("bucketFor - how much the learner actually wrote", () => {
  it("keeps a learner who wrote nothing out of the terse bucket", () => {
    // Folding these together would stock the 'short answers' bucket with every
    // skipped questionnaire, and that bucket is the one used to argue a cheap
    // model copes.
    expect(bucketFor(0).label).toBe("none");
    expect(bucketFor(1).label).toBe("terse <200");
  });

  it("puts each boundary in the higher bucket, so ranges cannot overlap", () => {
    expect(bucketFor(199).label).toBe("terse <200");
    expect(bucketFor(200).label).toBe("medium 200-600");
    expect(bucketFor(599).label).toBe("medium 200-600");
    expect(bucketFor(600).label).toBe("rich 600+");
  });

  it("has no upper limit on the rich bucket", () => {
    expect(bucketFor(50_000).label).toBe("rich 600+");
  });

  it("treats a negative count as none rather than falling through", () => {
    expect(bucketFor(-5).label).toBe("none");
  });

  it("covers the whole number line with no gaps between buckets", () => {
    for (let i = 0; i < ANSWER_CHAR_BUCKETS.length - 1; i++) {
      expect(ANSWER_CHAR_BUCKETS[i].max).toBe(ANSWER_CHAR_BUCKETS[i + 1].min);
    }
  });
});

describe("summariseArm - a null uptake is not a zero", () => {
  it("excludes unmeasurable rows from the mean instead of scoring them zero", () => {
    // 0.4 and 0.6 average to 0.5. If the null were read as a zero the answer
    // would be 0.333, and every learner who skipped the questions would drag
    // down the model that never had their context to use.
    const stat = summariseArm([
      row({ context_uptake: 0.4 }),
      row({ context_uptake: 0.6 }),
      row({ context_uptake: null }),
    ]);
    expect(stat.meanUptake).toBeCloseTo(0.5, 10);
  });

  it("counts rows and measured rows separately, so a thin mean looks thin", () => {
    const stat = summariseArm([
      row({ context_uptake: 0.4 }),
      row({ context_uptake: null }),
      row({ context_uptake: null }),
    ]);
    expect(stat.rows).toBe(3);
    expect(stat.measured).toBe(1);
  });

  it("distinguishes a genuine zero from an absent measurement", () => {
    const ignored = summariseArm([row({ context_uptake: 0 })]);
    expect(ignored.meanUptake).toBe(0);
    expect(ignored.measured).toBe(1);

    const nothingToIgnore = summariseArm([row({ context_uptake: null })]);
    expect(nothingToIgnore.meanUptake).toBeNull();
    expect(nothingToIgnore.measured).toBe(0);
  });

  it("returns null rather than NaN when no row was measurable", () => {
    const stat = summariseArm([row({ context_uptake: null, milestone_count: null })]);
    expect(stat.meanUptake).toBeNull();
    expect(stat.meanMilestones).toBeNull();
  });

  it("averages milestone counts, which is how a shorter track shows up", () => {
    const stat = summariseArm([row({ milestone_count: 8 }), row({ milestone_count: 4 })]);
    expect(stat.meanMilestones).toBe(6);
  });

  it("summarises an empty arm without dividing by zero", () => {
    expect(summariseArm([])).toEqual({
      rows: 0, measured: 0, meanUptake: null, meanMilestones: null,
    });
  });
});

describe("compareArms - the split that the aggregate hides", () => {
  it("shows a cheap model matching on terse answers and collapsing on rich ones", () => {
    // This is the finding the harness exists to make visible. Both arms average
    // to roughly the same number overall, and the buckets tell opposite stories.
    const baseline = [
      row({ answer_chars: 50,  context_uptake: 0.44 }),
      row({ answer_chars: 800, context_uptake: 0.39 }),
    ];
    const replay = [
      row({ answer_chars: 50,  context_uptake: 0.45, is_replay: true }),
      row({ answer_chars: 800, context_uptake: 0.19, is_replay: true }),
    ];

    const report = compareArms(baseline, replay, "claude-sonnet-4-6", "claude-haiku-4-5");

    const terse = report.byAnswerChars.find(b => b.bucket === "terse <200");
    const rich  = report.byAnswerChars.find(b => b.bucket === "rich 600+");

    expect(terse?.replay.meanUptake).toBeGreaterThan(terse!.baseline.meanUptake!);
    expect(rich?.replay.meanUptake).toBeLessThan(rich!.baseline.meanUptake!);
  });

  it("reports the overall means too, since that is the number that misleads", () => {
    const report = compareArms(
      [row({ context_uptake: 0.4 })],
      [row({ context_uptake: 0.2, is_replay: true })],
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    );
    expect(report.overall.baseline.meanUptake).toBeCloseTo(0.4, 10);
    expect(report.overall.replay.meanUptake).toBeCloseTo(0.2, 10);
  });

  it("drops buckets empty on both sides rather than printing blank rows", () => {
    const report = compareArms(
      [row({ answer_chars: 300 })],
      [row({ answer_chars: 300, is_replay: true })],
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    );
    expect(report.byAnswerChars.map(b => b.bucket)).toEqual(["medium 200-600"]);
  });

  it("keeps a bucket the replay failed to populate, because that is a finding", () => {
    const report = compareArms(
      [row({ answer_chars: 800 })],
      [],
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    );
    const rich = report.byAnswerChars.find(b => b.bucket === "rich 600+");
    expect(rich?.baseline.rows).toBe(1);
    expect(rich?.replay.rows).toBe(0);
    expect(rich?.replay.meanUptake).toBeNull();
  });

  it("carries both arm labels, so a saved report can be read months later", () => {
    const report = compareArms([row()], [], "claude-sonnet-4-6", "claude-haiku-4-5");
    expect(report.baselineArm).toBe("claude-sonnet-4-6");
    expect(report.replayArm).toBe("claude-haiku-4-5");
  });

  it("labels a context run by its prompts rather than its model", () => {
    // The reason the fields are named Arm and not Model: in a context run both
    // sides are the same model, and a column headed with it would say nothing.
    const report = compareArms([row()], [], "milestones.qa@1", "milestones.qa.context@1");
    expect(report.baselineArm).toBe("milestones.qa@1");
    expect(report.replayArm).toBe("milestones.qa.context@1");
  });
});


// ── The context arm (C2) ────────────────────────────────────────────────────
//
// migration 048 stores what a learner said so that "does their own context
// produce a better curriculum?" can be answered. These are the rules that make
// the second arm of that comparison trustworthy.

describe("replayEligibility in context mode", () => {
  it("refuses a baseline the learner wrote nothing for", () => {
    // The prompt builder renders the plain template for an empty answers
    // array, so this "treatment" would be the control again under a different
    // label - a row that quietly votes for no-difference.
    const verdict = replayEligibility(row({ answer_chars: 0 }), "context");
    expect(verdict).toEqual({ ok: false, reason: "no-answers" });
  });

  it("refuses a row that already used context, since it is the treatment", () => {
    const verdict = replayEligibility(row({ context_used: true }), "context");
    expect(verdict).toEqual({ ok: false, reason: "already-context" });
  });

  it("accepts an ordinary no-context baseline that has answers behind it", () => {
    expect(replayEligibility(row({ answer_chars: 300 }), "context")).toEqual({ ok: true });
  });

  it("still applies every rule a model run applies", () => {
    // The context rules are additional, not a replacement - a failed or
    // document-sourced generation is no more replayable here than there.
    expect(replayEligibility(row({ outcome: "failed" }), "context"))
      .toEqual({ ok: false, reason: "generation-failed" });
    expect(replayEligibility(row({ source_kind: "document" }), "context"))
      .toEqual({ ok: false, reason: "document-source" });
  });

  it("does not apply the context rules to a model run", () => {
    // A learner who wrote nothing is a perfectly good model-comparison
    // baseline: the prompt is identical on both arms either way.
    expect(replayEligibility(row({ answer_chars: 0 }), "model")).toEqual({ ok: true });
    expect(replayEligibility(row({ answer_chars: 0 }))).toEqual({ ok: true });
  });
});

describe("selectReplayable carries the mode through", () => {
  it("counts context-only skips against the right reason", () => {
    const rows = [row({ id: "a", answer_chars: 0 }), row({ id: "b", answer_chars: 400 })];
    const selection = selectReplayable(rows, 10, "context");

    expect(selection.eligible.map(r => r.id)).toEqual(["b"]);
    expect(selection.skipped).toEqual([{ reason: "no-answers", count: 1 }]);
  });
});

describe("dropMissingAnswers - a deletion must not become a fake treatment row", () => {
  it("drops a baseline whose answers the learner has since deleted", () => {
    // answer_chars is frozen at generation time and survives the deletion by
    // design, so the row still claims 600 characters. Only reading the answers
    // reveals there is nothing left to send.
    const rows = [row({ id: "a", goal_id: "goal-1", answer_chars: 600 })];
    const result = dropMissingAnswers(rows, new Map());

    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });

  it("drops a goal whose answers row exists but is empty", () => {
    const rows = [row({ goal_id: "goal-1" })];
    expect(dropMissingAnswers(rows, new Map([["goal-1", []]])).dropped).toBe(1);
  });

  it("keeps a baseline whose answers are still there", () => {
    const rows = [row({ id: "a", goal_id: "goal-1" })];
    const answers = new Map([["goal-1", [{ question: "why?", answer: "an interview" }]]]);

    expect(dropMissingAnswers(rows, answers).kept.map(r => r.id)).toEqual(["a"]);
    expect(dropMissingAnswers(rows, answers).dropped).toBe(0);
  });

  it("drops a row with no goal, because its answers can never be found", () => {
    expect(dropMissingAnswers([row({ goal_id: null })], new Map()).dropped).toBe(1);
  });
});

describe("replayModelFor - which model each arm runs at", () => {
  it("runs a context replay at the baseline's own model, so only the prompt differs", () => {
    const baseline = row({ model: "claude-sonnet-4-6" });
    expect(replayModelFor(baseline, "context", null)).toBe("claude-sonnet-4-6");
  });

  it("ignores a target model in context mode even if one is somehow passed", () => {
    // The script refuses --model with --context, and this is the second half
    // of that guarantee: a context run cannot vary two axes even by accident.
    const baseline = row({ model: "claude-sonnet-4-6" });
    expect(replayModelFor(baseline, "context", "claude-haiku-4-5")).toBe("claude-sonnet-4-6");
  });

  it("runs a model replay at the named model", () => {
    expect(replayModelFor(row(), "model", "claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });
});

describe("estimateReplayCost prices a context run per row", () => {
  it("uses each baseline's own model when the models differ", () => {
    // A context run can span models, and Hugh's rates differ by up to 20x -
    // pricing the whole run at one of them is the exact mistake CLAUDE.md
    // forbids for usage_logs, and it is no more acceptable here.
    const rows = [
      row({ model: "claude-sonnet-4-6", tokens_in: 1000, tokens_out: 1000 }),
      row({ model: "claude-haiku-4-5",  tokens_in: 1000, tokens_out: 1000 }),
    ];
    const perRow = estimateReplayCost(rows, r => r.model);
    const allSonnet = estimateReplayCost(rows, "claude-sonnet-4-6");

    expect(perRow).toBeLessThan(allSonnet);
    expect(perRow).toBeGreaterThan(0);
  });

  it("still accepts a plain model string for a model run", () => {
    expect(estimateReplayCost([row()], "claude-haiku-4-5")).toBeGreaterThan(0);
  });
});
