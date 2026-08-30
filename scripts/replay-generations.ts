/**
 * Replay stored curriculum generations against a different model.
 *
 * `track_generations` (migration 048) records what produced each curriculum.
 * This is the script that makes that store pay: it takes generations that
 * really happened, re-runs them at the SAME prompt with a different model, and
 * prints the two arms side by side.
 *
 * Usage:
 *   npx tsx scripts/replay-generations.ts --model claude-haiku-4-5
 *   npx tsx scripts/replay-generations.ts --model claude-haiku-4-5 --limit 50 --yes
 *   npx tsx scripts/replay-generations.ts --model claude-haiku-4-5 --out report.json
 *
 * Without `--yes` it is a dry run: it selects, prices, and stops. Nothing is
 * sent to Anthropic and nothing is written.
 *
 * ── What this does NOT do, and why ─────────────────────────────────────────
 *
 * It does not call `generateTrack`. That function inserts a `tracks` row and
 * `milestones` rows and then has `assignBacklogPriority` UPDATE them — running
 * it here would put phantom tracks on real learners' boards and rewrite their
 * cards. A replay re-runs the milestone-generation call ONLY. It is read-only
 * against every learner-owned table and append-only against
 * `track_generations`.
 *
 * The consequence, written on every row it produces: `track_id` is null,
 * `ranked` is false, and `milestones_out` holds the generation parse rather
 * than the board a learner was served, because no board was served. Real rows
 * snapshot the served board including its ranking (decision D3); replay rows
 * cannot, and say so through `is_replay` and `ranked`. Ranking is a separate
 * prompt with its own fingerprint and deserves its own experiment.
 *
 * ── The spend is invisible, so the gate is real ────────────────────────────
 *
 * A replay writes no `usage_logs` row. It cannot: `usage_logs.user_id` is NOT
 * NULL against `auth.users`, and billing a replay to a real learner would
 * spend their quota on traffic they never triggered (decision Q4). So this
 * script's own cost estimate is the only warning before the money leaves, and
 * `--yes` is the only thing that lets it.
 */
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnvLocal, requireEnv } from "./lib/env";

loadEnvLocal();

// Imported from generateMilestones.ts, NOT generate.ts: the latter pulls in
// logUsage and logSafeError, both of which import `server-only`, which throws
// the moment a plain Node process loads it. That split is the reason the module
// exists — see its top comment.
import { generateMilestones, MAX_TOKENS } from "@/lib/tracker/generateMilestones";
import { promptFingerprint, promptVersion } from "@/lib/claude/promptIdentity";
import { answerChars, contextUptake, type QAPair } from "@/lib/learn/contextUptake";
import { errorClassOf, sanitize } from "@/lib/observability/sanitize";
import { estimateCost } from "@/lib/pricing";
import {
  compareArms,
  distinctFingerprints,
  estimateReplayCost,
  excludeAlreadyReplayed,
  selectReplayable,
  INELIGIBLE_EXPLANATIONS,
  type ArmStat,
  type ComparisonReport,
  type GenerationRow,
} from "@/lib/learn/replay";
import { type KanbanColumn } from "@/types";

/** The columns a replay reads. Kept in one place so the select and the type agree. */
const ROW_COLUMNS =
  "id,user_id,goal_id,source_kind,model,prompt_fingerprint,input_topic," +
  "answer_chars,context_uptake,milestone_count,outcome,tokens_in,tokens_out,is_replay";

/**
 * Only QA generations are replayable, so only that fingerprint is ever the
 * subject of a run. Read from the registry rather than typed, for the same
 * reason `generateTrack` does: a hand-copied hash is a hash that can go stale.
 */
const QA_PROMPT_ID = "milestones.qa" as const;

/** Mirrors `generateTrack` — a model naming a column that is not real is coerced. */
const VALID_COLUMNS: KanbanColumn[] = ["backlog", "learn", "review", "done"];

interface Args {
  model:       string;
  limit:       number;
  spend:       boolean;
  redo:        boolean;
  out:         string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { model: "", limit: 10, spend: false, redo: false, out: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--model")            args.model = argv[++i] ?? "";
    else if (arg === "--limit")       args.limit = Number(argv[++i] ?? "10");
    else if (arg === "--out")         args.out   = argv[++i] ?? null;
    else if (arg === "--yes")         args.spend = true;
    else if (arg === "--redo")        args.redo  = true;
    else if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    else { console.error(`Unknown argument: ${arg}`); usage(); process.exit(1); }
  }
  return args;
}

function usage(): void {
  console.log(`
Replay stored curriculum generations against a different model.

  --model <id>    Model to replay with (required), e.g. claude-haiku-4-5
  --limit <n>     How many generations to replay (default 10)
  --yes           Actually spend. Without it this is a dry run.
  --redo          Replay goals already covered at this model.
  --out <path>    Write the full comparison, with pairing, as JSON.

A replay writes no usage_logs row, so its spend never reaches the admin cost
dashboard. The estimate printed before the run is the only warning you get.
`);
}

/** Two decimal-ish places for a rate in [0,1], or a dash when unmeasurable. */
function fmtUptake(value: number | null): string {
  return value === null ? "   -  " : value.toFixed(3).padStart(6);
}

function fmtCount(value: number | null): string {
  return value === null ? "  - " : value.toFixed(1).padStart(4);
}

function armCell(stat: ArmStat): string {
  return `${fmtUptake(stat.meanUptake)}  (${String(stat.measured).padStart(3)}/${String(stat.rows).padEnd(3)})`;
}

function printComparison(report: ComparisonReport): void {
  console.log(`\n  Context uptake — mean over measured rows, (measured/rows)\n`);
  console.log(`  ${"".padEnd(16)}  ${report.baselineModel.padEnd(20)}  ${report.replayModel}`);
  console.log(`  ${"-".repeat(16)}  ${"-".repeat(20)}  ${"-".repeat(20)}`);
  console.log(
    `  ${"OVERALL".padEnd(16)}  ${armCell(report.overall.baseline).padEnd(20)}  ${armCell(report.overall.replay)}`,
  );
  for (const bucket of report.byAnswerChars) {
    console.log(
      `  ${bucket.bucket.padEnd(16)}  ${armCell(bucket.baseline).padEnd(20)}  ${armCell(bucket.replay)}`,
    );
  }
  console.log(`\n  Milestones per track\n`);
  console.log(
    `  ${"OVERALL".padEnd(16)}  ${fmtCount(report.overall.baseline.meanMilestones).padEnd(20)}  ${fmtCount(report.overall.replay.meanMilestones)}`,
  );
  for (const bucket of report.byAnswerChars) {
    console.log(
      `  ${bucket.bucket.padEnd(16)}  ${fmtCount(bucket.baseline.meanMilestones).padEnd(20)}  ${fmtCount(bucket.replay.meanMilestones)}`,
    );
  }
}

/**
 * The learner's answers for a set of goals, in one query.
 *
 * Read to MEASURE, exactly as `generateTrack` reads them: the words are turned
 * into a number and dropped. Nothing here writes them anywhere, and the replay
 * prompt does not receive them — `context_used` stays false because the
 * generation prompt still does not consume answers.
 *
 * A goal whose answers the learner has deleted simply comes back empty, and
 * its replay records a null uptake. That is what deletion is supposed to cost.
 */
async function readAnswersByGoal(
  supabase: SupabaseClient,
  goalIds:  readonly string[],
): Promise<Map<string, QAPair[]>> {
  const byGoal = new Map<string, QAPair[]>();
  if (goalIds.length === 0) return byGoal;

  const { data, error } = await supabase
    .from("goal_answers")
    .select("goal_id, question, answer")
    .in("goal_id", goalIds)
    .order("position", { ascending: true });

  if (error) {
    console.error(`  ! could not read goal answers: ${error.message}`);
    return byGoal;
  }

  for (const raw of data ?? []) {
    const rowData = raw as { goal_id: string; question: string; answer: string };
    const list = byGoal.get(rowData.goal_id) ?? [];
    list.push({ question: rowData.question, answer: rowData.answer });
    byGoal.set(rowData.goal_id, list);
  }
  return byGoal;
}

/** Goals already replayed at this model, so a second run does not pay twice. */
async function readReplayedGoalIds(
  supabase:    SupabaseClient,
  model:       string,
  fingerprint: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("track_generations")
    .select("goal_id")
    .eq("is_replay", true)
    .eq("model", model)
    .eq("prompt_fingerprint", fingerprint);

  if (error) {
    console.error(`  ! could not read prior replays: ${error.message}`);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map(r => (r as { goal_id: string | null }).goal_id)
      .filter((id): id is string => Boolean(id)),
  );
}

/** One baseline, replayed. */
interface ReplayOutcome {
  baselineId: string;
  goalId:     string | null;
  ok:         boolean;
  errorClass: string | null;
  /**
   * A scrubbed one-line reason, for the operator's console only.
   *
   * `error_class` alone is what goes to the database, and on its own it is not
   * diagnosable: an SDK configuration failure and a network failure are both
   * "Error", so a run can fail identically for reasons that need opposite
   * fixes. This goes through the same `sanitize` that `logSafeError` uses, with
   * the topic passed as a secret, so a model's echo of learner text cannot ride
   * out on it.
   */
  reason:     string | null;
  row:        GenerationRow | null;
}

/**
 * Re-run one stored generation and write its provenance row.
 *
 * `answer_chars` and `answer_count` are COPIED from the baseline rather than
 * recomputed. Those figures were frozen at the original generation for the
 * reason `contextUptake.ts` documents, and a learner who has since deleted
 * their answers would otherwise recompute to zero — moving the replay into the
 * "none" bucket while its baseline stayed in "rich", and quietly comparing two
 * different populations. The uptake itself still goes null in that case,
 * because measuring it genuinely requires the words.
 */
async function replayOne(
  supabase: SupabaseClient,
  baseline: GenerationRow,
  answers:  readonly QAPair[],
  model:    string,
): Promise<ReplayOutcome> {
  const startedAt = Date.now();
  let failureReason: string | null = null;

  const record: Record<string, unknown> = {
    user_id:            baseline.user_id,
    goal_id:            baseline.goal_id,
    track_id:           null,
    source_kind:        "qa",
    model,
    prompt_version:     promptVersion(QA_PROMPT_ID),
    prompt_fingerprint: promptFingerprint(QA_PROMPT_ID),
    max_tokens:         MAX_TOKENS,
    input_topic:        baseline.input_topic,
    answer_count:       answers.length,
    context_used:       false,
    answer_chars:       baseline.answer_chars,
    context_uptake:     null,
    milestones_out:     null,
    milestone_count:    null,
    ranked:             false,
    rank_model:         null,
    rank_fingerprint:   null,
    columns_coerced:    0,
    outcome:            "failed",
    error_class:        null,
    attempts:           0,
    generation_ms:      null,
    tokens_in:          0,
    tokens_out:         0,
    is_replay:          true,
  };

  try {
    const { parsed, usage, attempts, model: usedModel } = await generateMilestones(
      baseline.input_topic,
      undefined,
      model,
    );

    // The model actually called, not the one requested — one binding, as
    // CLAUDE.md requires, held across the function boundary.
    record.model      = usedModel;
    record.attempts   = attempts;
    record.tokens_in  = usage.inputTokens;
    record.tokens_out = usage.outputTokens;

    let coerced = 0;
    const board = parsed.milestones.map((m, i) => {
      const valid = VALID_COLUMNS.includes(m.column as KanbanColumn);
      if (!valid) coerced++;
      return {
        title:           m.title,
        summary:         m.summary,
        column:          valid ? (m.column as KanbanColumn) : "backlog",
        position:        i,
        // No ranking call is made, so these are null on every replay row.
        priority_rank:   null,
        priority_reason: null,
      };
    });

    record.columns_coerced = coerced;
    record.milestones_out  = board;
    record.milestone_count = board.length;
    record.context_uptake  = contextUptake(answers, parsed.milestones);
    record.outcome         = "ok";
  } catch (err) {
    record.error_class = errorClassOf(err);
    failureReason      = sanitize(err, [baseline.input_topic]);
  }

  record.generation_ms = Date.now() - startedAt;

  const { error } = await supabase.from("track_generations").insert(record);
  if (error) console.error(`  ! could not write replay row: ${error.message}`);

  const ok = record.outcome === "ok";
  return {
    baselineId: baseline.id,
    goalId:     baseline.goal_id,
    ok,
    errorClass: (record.error_class as string | null) ?? null,
    reason:     failureReason,
    row: ok
      ? {
          id:                 "",
          user_id:            baseline.user_id,
          goal_id:            baseline.goal_id,
          source_kind:        "qa",
          model:              record.model as string,
          prompt_fingerprint: record.prompt_fingerprint as string,
          input_topic:        baseline.input_topic,
          answer_chars:       baseline.answer_chars,
          context_uptake:     record.context_uptake as number | null,
          milestone_count:    record.milestone_count as number,
          outcome:            "ok",
          tokens_in:          record.tokens_in as number,
          tokens_out:         record.tokens_out as number,
          is_replay:          true,
        }
      : null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.model) {
    console.error("\n--model is required.\n");
    usage();
    process.exit(1);
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) {
    console.error("\n--limit must be a positive number.\n");
    process.exit(1);
  }

  requireEnv("ANTHROPIC_API_KEY");
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const fingerprint = promptFingerprint(QA_PROMPT_ID);
  console.log(`\nReplaying ${QA_PROMPT_ID} @ ${fingerprint} (${promptVersion(QA_PROMPT_ID)})`);
  console.log(`Target model: ${args.model}\n`);

  // Over-fetch, because filtering happens in the pure module rather than in SQL
  // — the reasons a row is unreplayable are rules with explanations attached,
  // and they belong somewhere testable rather than in a query string.
  const { data, error } = await supabase
    .from("track_generations")
    .select(ROW_COLUMNS)
    .eq("prompt_fingerprint", fingerprint)
    .order("created_at", { ascending: false })
    .limit(Math.max(args.limit * 5, 200));

  if (error) {
    console.error(`Could not read track_generations: ${error.message}`);
    process.exit(1);
  }

  const candidates = (data ?? []) as unknown as GenerationRow[];
  if (candidates.length === 0) {
    console.log("No generations recorded at this fingerprint yet — nothing to replay.");
    console.log("The store fills as learners build tracks; come back once it has.\n");
    return;
  }

  const fingerprints = distinctFingerprints(candidates);
  if (fingerprints.length > 1) {
    console.error(`Refusing to run: candidates span ${fingerprints.length} prompts.`);
    console.error("A comparison across two prompts is a prompt change wearing a model change.\n");
    process.exit(1);
  }

  const selection = selectReplayable(candidates, args.limit);

  console.log(`  ${candidates.length} candidate rows`);
  for (const skip of selection.skipped) {
    console.log(`  ${String(skip.count).padStart(4)} skipped — ${INELIGIBLE_EXPLANATIONS[skip.reason]}`);
  }

  let toReplay = selection.eligible;
  if (!args.redo) {
    const done = await readReplayedGoalIds(supabase, args.model, fingerprint);
    const fresh = excludeAlreadyReplayed(toReplay, done);
    if (fresh.alreadyDone > 0) {
      console.log(`  ${String(fresh.alreadyDone).padStart(4)} skipped — already replayed at this model (--redo to repeat)`);
    }
    toReplay = fresh.fresh;
  }

  console.log(`  ${selection.eligibleFound} eligible, ${toReplay.length} selected for this run`);

  if (toReplay.length === 0) {
    console.log("\nNothing to replay.\n");
    return;
  }

  const estimate = estimateReplayCost(toReplay, args.model);
  console.log(`\n  Estimated cost: $${estimate.toFixed(4)} for ${toReplay.length} generations`);
  console.log("  This spend is NOT recorded in usage_logs and will not appear in /admin.\n");

  if (!args.spend) {
    console.log("Dry run. Re-run with --yes to spend and write.\n");
    return;
  }

  const goalIds = toReplay.map(r => r.goal_id).filter((id): id is string => Boolean(id));
  const answersByGoal = await readAnswersByGoal(supabase, goalIds);

  const outcomes: ReplayOutcome[] = [];
  let spentIn = 0;
  let spentOut = 0;

  for (const [index, baseline] of toReplay.entries()) {
    const answers = baseline.goal_id ? answersByGoal.get(baseline.goal_id) ?? [] : [];
    process.stdout.write(
      `  [${String(index + 1).padStart(3)}/${toReplay.length}] ${baseline.input_topic.slice(0, 48).padEnd(48)} `,
    );

    const outcome = await replayOne(supabase, baseline, answers, args.model);
    outcomes.push(outcome);

    if (outcome.row) {
      spentIn  += outcome.row.tokens_in;
      spentOut += outcome.row.tokens_out;
      const uptake = outcome.row.context_uptake;
      console.log(`ok   uptake ${uptake === null ? "  -  " : uptake.toFixed(3)}  (${answers.length} answers, ${answerChars(answers)} chars read)`);
    } else {
      console.log(`FAIL ${outcome.errorClass ?? "unknown"}: ${outcome.reason ?? "no detail"}`);
    }
  }

  const replayRows = outcomes.map(o => o.row).filter((r): r is GenerationRow => r !== null);
  const replayedBaselineIds = new Set(outcomes.filter(o => o.ok).map(o => o.baselineId));
  const baselineRows = toReplay.filter(r => replayedBaselineIds.has(r.id));

  const baselineModel = [...new Set(baselineRows.map(r => r.model))].join(", ") || "baseline";
  const report = compareArms(baselineRows, replayRows, baselineModel, args.model);

  printComparison(report);

  const actual = estimateCost(spentIn, spentOut, 0, args.model);
  console.log(`\n  ${replayRows.length} replayed, ${outcomes.length - replayRows.length} failed`);
  console.log(`  Actual cost: $${actual.toFixed(4)}  (${spentIn} in / ${spentOut} out)\n`);

  if (args.out) {
    // The pairing is written here because `track_generations` has no
    // `replay_of` column — this file is what makes a run re-analysable later
    // without guessing which baseline produced which replay.
    const payload = {
      ranAt:       new Date().toISOString(),
      fingerprint,
      promptId:    QA_PROMPT_ID,
      promptVersion: promptVersion(QA_PROMPT_ID),
      replayModel: args.model,
      report,
      pairs: outcomes.map(o => ({
        baselineId: o.baselineId,
        goalId:     o.goalId,
        ok:         o.ok,
        errorClass: o.errorClass,
        reason:     o.reason,
        uptake:     o.row?.context_uptake ?? null,
        milestones: o.row?.milestone_count ?? null,
      })),
    };
    fs.writeFileSync(args.out, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`  Report written to ${args.out}\n`);
  }
}

main().catch((err: unknown) => {
  console.error(`\nReplay failed: ${errorClassOf(err)}`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
