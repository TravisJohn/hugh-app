/**
 * The pure half of the curriculum replay harness.
 *
 * `track_generations` (migration 048) records what produced each curriculum.
 * On its own that is a table nobody reads. The replay harness is what makes it
 * pay: it takes generations that really happened, re-runs them against a
 * different model at the SAME prompt, and puts the two side by side.
 *
 * The comparison the store was designed for is "same prompt, different model"
 * (decision D4). That is expressible only because the model is deliberately
 * NOT part of `prompt_fingerprint` — see `lib/claude/promptIdentity.ts`. Every
 * function here leans on that: an arm is a set of rows sharing a fingerprint
 * and differing in `model`.
 *
 * ── What lives here and what does not ──────────────────────────────────────
 *
 * Everything in this module is a rule or a sum: which rows may be replayed,
 * what a replay will cost, and how two arms compare. No I/O, no clock, no
 * Anthropic client, no Supabase client. `scripts/replay-generations.ts` is the
 * shell that does those things and calls in here for every decision, per the
 * "pure logic goes in a testable module" rule in CLAUDE.md.
 *
 * ── The one measurement rule that matters ──────────────────────────────────
 *
 * A null `context_uptake` is NOT a zero. `lib/learn/contextUptake.ts` returns
 * null when the learner gave no content terms at all ("idk", or no answers, or
 * answers since deleted), and zero when they gave real context the model then
 * ignored. Averaging nulls as zeroes would drag every arm down by however many
 * learners skipped the questions, and would make a model look worse for
 * learners it never had anything to work with on. Nulls are excluded from the
 * mean and counted separately, everywhere, without exception.
 */

import { estimateCost } from "@/lib/pricing";

/**
 * A stored generation, in the shape the harness reads it.
 *
 * A subset of `track_generations` — the columns a replay needs to decide
 * eligibility, re-run the call, and compare the result. Deliberately not the
 * whole row: `milestones_out` is large and is only ever read by a human
 * eyeballing two curricula, never by the maths in this module.
 */
export interface GenerationRow {
  id:                 string;
  user_id:            string | null;
  goal_id:            string | null;
  source_kind:        "qa" | "document";
  model:              string;
  prompt_fingerprint: string;
  input_topic:        string;
  answer_chars:       number;
  context_uptake:     number | null;
  milestone_count:    number | null;
  outcome:            "ok" | "failed";
  tokens_in:          number;
  tokens_out:         number;
  is_replay:          boolean;
}

/** Why a stored generation cannot serve as a replay baseline. */
export type IneligibleReason =
  | "already-a-replay"
  | "document-source"
  | "generation-failed"
  | "no-topic";

export type Eligibility =
  | { ok: true }
  | { ok: false; reason: IneligibleReason };

/** Readable explanations, so the script can tell an operator what it skipped. */
export const INELIGIBLE_EXPLANATIONS: Record<IneligibleReason, string> = {
  "already-a-replay":
    "already a replay - replaying a replay compares two experiments, not a model against the product",
  "document-source":
    "document-sourced - the extracted text is deleted once read, so this input no longer exists",
  "generation-failed":
    "the original generation failed - there is no curriculum to compare against",
  "no-topic":
    "no input topic recorded - nothing to re-run",
};

/**
 * Whether a stored generation can be used as a replay baseline.
 *
 * The document rule is the one worth spelling out, because it is permanent and
 * not obvious from the schema. The goal-from-document path deletes the
 * extracted text once the milestones are generated (see the `source_kind`
 * comment in `lib/tracker/generate.ts`). `input_topic` survives, but the
 * document does not — so re-running a document generation from its topic alone
 * would send `milestones.qa` where the original sent `milestones.document`.
 * Those are two different prompts with two different fingerprints, and
 * comparing across them is exactly the mistake the fingerprint exists to
 * prevent. A document generation is therefore unreplayable forever, not
 * unreplayable for now.
 */
export function replayEligibility(row: GenerationRow): Eligibility {
  if (row.is_replay)                  return { ok: false, reason: "already-a-replay" };
  if (row.source_kind === "document") return { ok: false, reason: "document-source" };
  if (row.outcome !== "ok")           return { ok: false, reason: "generation-failed" };
  if (!row.input_topic.trim())        return { ok: false, reason: "no-topic" };
  return { ok: true };
}

export interface Selection {
  /** Rows that will be replayed, capped at the requested limit. */
  eligible: GenerationRow[];
  /** Every row that will not be, with the reason, counted. */
  skipped: Array<{ reason: IneligibleReason; count: number }>;
  /** Eligible rows found before the limit was applied. */
  eligibleFound: number;
}

/**
 * Choose which stored generations to replay.
 *
 * The limit is applied AFTER filtering, so `--limit 20` means twenty real
 * replays rather than twenty candidates of which some are silently dropped.
 * `eligibleFound` is reported alongside so an operator can see when the limit,
 * rather than the corpus, is what bounded the run.
 */
export function selectReplayable(
  rows:  readonly GenerationRow[],
  limit: number,
): Selection {
  const eligible: GenerationRow[] = [];
  const counts = new Map<IneligibleReason, number>();

  for (const row of rows) {
    const verdict = replayEligibility(row);
    if (verdict.ok) {
      eligible.push(row);
    } else {
      counts.set(verdict.reason, (counts.get(verdict.reason) ?? 0) + 1);
    }
  }

  return {
    eligible:      eligible.slice(0, Math.max(0, limit)),
    eligibleFound: eligible.length,
    skipped:       [...counts.entries()].map(([reason, count]) => ({ reason, count })),
  };
}

/**
 * What a replay run will cost, in USD, before it spends anything.
 *
 * This matters more here than anywhere else in Hugh: a replay writes no
 * `usage_logs` row — it cannot, because `usage_logs.user_id` is NOT NULL
 * against `auth.users` and a replay has no learner to bill (decision Q4). So
 * replay spend is invisible to the admin cost dashboard, and this estimate is
 * the only warning an operator gets before the money leaves.
 *
 * The estimate uses each baseline row's own recorded token counts as the
 * predictor for its replay. Input is near-exact: the same prompt template with
 * the same topic interpolated, so the input side barely moves between models.
 * Output is the softer half — a different model may write longer or shorter
 * milestones — so read this as the right order of magnitude, not a quote.
 *
 * The `ttsChars` argument is zero: no path in the replay harness touches
 * ElevenLabs.
 */
export function estimateReplayCost(
  rows:  readonly GenerationRow[],
  model: string,
): number {
  return rows.reduce(
    (sum, r) => sum + estimateCost(r.tokens_in, r.tokens_out, 0, model),
    0,
  );
}

/**
 * The distinct prompt fingerprints present in a set of rows.
 *
 * A comparison across two fingerprints is not a model comparison — it is a
 * prompt change wearing one. The script uses this to refuse rather than to
 * quietly average two prompts together, which is the failure mode
 * `promptIdentity.ts` exists to make impossible.
 */
export function distinctFingerprints(rows: readonly GenerationRow[]): string[] {
  return [...new Set(rows.map(r => r.prompt_fingerprint))].sort();
}

export interface FreshSelection {
  /** Rows not yet replayed at the target model. */
  fresh:       GenerationRow[];
  /** Rows skipped because a replay of that goal already exists. */
  alreadyDone: number;
}

/**
 * Drop baselines that have already been replayed at the target model.
 *
 * Without this, running the harness twice pays twice for the same answer, and
 * pays it invisibly — replay spend never reaches `usage_logs`. Re-running is
 * sometimes what you want (a prompt has moved, or a model has been updated
 * behind its name), so the script exposes this as a flag rather than an
 * unconditional rule.
 *
 * Matching is by `goal_id`, because `track_generations` has no `replay_of`
 * column. That is a deliberate v1 limitation rather than an oversight: adding
 * one is a migration, and the explicit baseline-to-replay pairing is written
 * into the run's JSON report instead, where it is unambiguous. The consequence
 * to know: a goal whose track was retried has several baselines, so replaying
 * any one of them marks all of them done. It errs toward not spending, which
 * is the right way for a money-spending default to be wrong.
 *
 * A row with no `goal_id` cannot be matched and is always treated as fresh.
 */
export function excludeAlreadyReplayed(
  rows:            readonly GenerationRow[],
  replayedGoalIds: ReadonlySet<string>,
): FreshSelection {
  const fresh = rows.filter(r => !(r.goal_id && replayedGoalIds.has(r.goal_id)));
  return { fresh, alreadyDone: rows.length - fresh.length };
}

/**
 * How much the learner wrote, bucketed.
 *
 * This axis exists because the aggregate hides the finding that matters. A
 * cheaper model can match on terse answers and collapse on rich ones, and the
 * two effects cancel in a single mean — so a headline "0.41 against 0.38, ship
 * it" can be sitting on top of a model that fails precisely the learners who
 * told Hugh the most about themselves.
 *
 * The boundaries are per-generation totals across all five answers, not per
 * answer. Under 200 characters over five answers averages under forty each —
 * a phrase, not a sentence. Over 600 averages more than a hundred and twenty
 * each, which is a learner writing in paragraphs. 200 is also the cap
 * `lib/learn/topicInput.ts` already enforces on a topic, so the number is
 * borrowed rather than invented.
 */
export interface AnswerBucket {
  label: string;
  /** Inclusive lower bound. */
  min:   number;
  /** Exclusive upper bound; `Infinity` on the last bucket. */
  max:   number;
}

export const ANSWER_CHAR_BUCKETS: readonly AnswerBucket[] = [
  { label: "none",           min: 0,   max: 1        },
  { label: "terse <200",     min: 1,   max: 200      },
  { label: "medium 200-600", min: 200, max: 600      },
  { label: "rich 600+",      min: 600, max: Infinity },
];

/**
 * Which bucket a generation falls in.
 *
 * "none" is separated from "terse" deliberately: a learner who answered
 * nothing and a learner who answered briefly are different populations, and
 * folding them together would put every skipped questionnaire into the bucket
 * used to argue that a cheap model handles short answers well.
 */
export function bucketFor(answerChars: number): AnswerBucket {
  const chars = Math.max(0, answerChars);
  for (const bucket of ANSWER_CHAR_BUCKETS) {
    if (chars >= bucket.min && chars < bucket.max) return bucket;
  }
  return ANSWER_CHAR_BUCKETS[ANSWER_CHAR_BUCKETS.length - 1];
}

/** One arm's numbers, over one group of rows. */
export interface ArmStat {
  /** Rows in the group. */
  rows:           number;
  /** Rows whose `context_uptake` was measurable — see the null rule above. */
  measured:       number;
  /** Mean uptake over measured rows only; null when none were measurable. */
  meanUptake:     number | null;
  /** Mean milestone count over rows that produced one; null when none did. */
  meanMilestones: number | null;
}

const EMPTY_ARM: ArmStat = { rows: 0, measured: 0, meanUptake: null, meanMilestones: null };

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Reduce a group of rows to one arm's numbers.
 *
 * Note what `rows` and `measured` being separate buys: an arm reading
 * "40 rows, 12 measured, 0.44" is honest about resting on twelve samples,
 * where a lone mean would look like forty.
 */
export function summariseArm(rows: readonly GenerationRow[]): ArmStat {
  const uptakes    = rows.map(r => r.context_uptake).filter((v): v is number => v !== null);
  const milestones = rows.map(r => r.milestone_count).filter((v): v is number => v !== null);

  return {
    rows:           rows.length,
    measured:       uptakes.length,
    meanUptake:     mean(uptakes),
    meanMilestones: mean(milestones),
  };
}

export interface BucketComparison {
  bucket:   string;
  baseline: ArmStat;
  replay:   ArmStat;
}

export interface ComparisonReport {
  baselineModel: string;
  replayModel:   string;
  overall:       { baseline: ArmStat; replay: ArmStat };
  byAnswerChars: BucketComparison[];
}

/**
 * Compare two arms overall and split by how much the learner wrote.
 *
 * Buckets with no rows on either side are dropped, because a table of empty
 * rows is harder to read than a short one. A bucket populated on only one side
 * is kept: "the replay produced nothing here" is a finding, not a blank.
 */
export function compareArms(
  baseline:      readonly GenerationRow[],
  replay:        readonly GenerationRow[],
  baselineModel: string,
  replayModel:   string,
): ComparisonReport {
  const byAnswerChars: BucketComparison[] = [];

  for (const bucket of ANSWER_CHAR_BUCKETS) {
    const inBucket = (r: GenerationRow) => bucketFor(r.answer_chars).label === bucket.label;
    const b = baseline.filter(inBucket);
    const p = replay.filter(inBucket);
    if (b.length === 0 && p.length === 0) continue;
    byAnswerChars.push({
      bucket:   bucket.label,
      baseline: b.length ? summariseArm(b) : EMPTY_ARM,
      replay:   p.length ? summariseArm(p) : EMPTY_ARM,
    });
  }

  return {
    baselineModel,
    replayModel,
    overall: { baseline: summariseArm(baseline), replay: summariseArm(replay) },
    byAnswerChars,
  };
}
