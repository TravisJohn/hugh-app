/**
 * Send one prompt to any provider and report what came back, what it cost, and
 * how long it took.
 *
 * This is the cheapest way to answer "is another provider good enough?" — it
 * touches no route, no learner and no database, and writes nothing. It calls
 * `lib/llm/complete.ts`, the same entry point a route uses, so what it measures
 * is the real path rather than a copy of it. That constraint is documented at
 * the top of `lib/tracker/generateMilestones.ts` and is why `complete.ts` has
 * no `server-only` import.
 *
 * Usage:
 *   npx tsx scripts/llm-probe.ts --model claude-haiku-4-5 --prompt "Explain linear regression"
 *   npx tsx scripts/llm-probe.ts --model ollama/llama3.2:3b --prompt "Explain linear regression"
 *
 * The mode that actually decides whether a provider can serve Hugh:
 *   npx tsx scripts/llm-probe.ts --model ollama/llama3.2:3b --learn "Linear Regression" --prompt "Why does the intercept matter?"
 *
 * `--learn` sends the REAL `focusedLearningSystemPrompt` and then runs the real
 * `parseChatResponse` over the reply. That matters because `learn/chat` does not
 * ask for prose — it demands a strict JSON object with every quote and newline
 * escaped, including inside a code field. Teaching quality is the second
 * question; holding that contract is the first, and a model that fails it
 * cannot serve the route however well it explains regression.
 *
 * Nothing here is billed to a learner: no `usage_logs` row is written, because
 * `usage_logs.user_id` is NOT NULL against a real account and a probe belongs
 * to nobody. The cost printed below is therefore the only record that this
 * spent anything — the same reasoning `scripts/replay-generations.ts` gives for
 * its own estimate.
 */
import { loadEnvLocal } from "./lib/env";
import { complete } from "@/lib/llm/complete";
import { isLocalModel, isCallableModel, UnknownModelError } from "@/lib/llm/registry";
import { InvalidLlmRequestError } from "@/lib/llm/validate";
import { DEFAULT_OLLAMA_BASE_URL } from "@/lib/llm/providers/openaiCompatible";
import { estimateCost } from "@/lib/pricing";
import { focusedLearningSystemPrompt } from "@/lib/claude/prompts";
import { parseChatResponse } from "@/lib/askcode/parse";
import type { CacheHint, LlmRequest, LlmResponse } from "@/lib/llm/types";

interface Args {
  model:     string;
  prompt:    string;
  system:    string | null;
  learn:     string | null;
  maxTokens: number;
  cache:     CacheHint;
}

const HELP = [
  "",
  "Send one prompt to any provider and report reply, tokens, cost and latency.",
  "",
  "  --model <id>        Required. e.g. claude-haiku-4-5, gpt-4o-mini,",
  "                      or ollama/<tag> for a local model.",
  "  --prompt <text>     Required. The user message.",
  "  --learn <topic>     Use Hugh's real Learn system prompt for this topic, and",
  "                      check the reply against the real JSON parser.",
  "  --system <text>     A system prompt of your own. Ignored when --learn is set.",
  "  --max-tokens <n>    Output ceiling. Default 1024, matching learn/chat.",
  "  --cache <hint>      none | 5m | 1h. Default none. Anthropic only; other",
  "                      providers report that it was not applied.",
  "",
  "Nothing is written to the database and no usage row is logged.",
  "",
].join("\n");

function parseArgs(argv: string[]): Args {
  const args: Args = { model: "", prompt: "", system: null, learn: null, maxTokens: 1024, cache: "none" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--model")             args.model     = argv[++i] ?? "";
    else if (arg === "--prompt")       args.prompt    = argv[++i] ?? "";
    else if (arg === "--system")       args.system    = argv[++i] ?? null;
    else if (arg === "--learn")        args.learn     = argv[++i] ?? null;
    else if (arg === "--max-tokens")   args.maxTokens = Number(argv[++i] ?? "1024");
    else if (arg === "--cache")        args.cache     = (argv[++i] ?? "none") as CacheHint;
    else if (arg === "--help" || arg === "-h") { console.log(HELP); process.exit(0); }
    else { console.error(`Unrecognised argument: ${arg}`); console.log(HELP); process.exit(1); }
  }

  return args;
}

/**
 * Explain a failure in terms of the thing to go and fix.
 *
 * Architecture rule 5 in miniature: a probe that prints a raw stack trace makes
 * "the daemon is not running" look identical to "the model does not exist", and
 * those have completely different fixes.
 */
function explain(err: unknown, model: string): string {
  if (err instanceof UnknownModelError)      return err.message;
  if (err instanceof InvalidLlmRequestError) return err.message;

  const text = err instanceof Error ? err.message : String(err);
  const tag  = model.replace("ollama/", "");

  if (isLocalModel(model) && /ECONNREFUSED|fetch failed|Connection error/i.test(text)) {
    const url = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
    return [
      `Could not reach the Ollama daemon at ${url}.`,
      `  Is it running?         ollama serve`,
      `  Is the model pulled?   ollama pull ${tag}`,
    ].join("\n");
  }

  if (isLocalModel(model) && /not found|no such model/i.test(text)) {
    return `Ollama does not have that model locally. Pull it first:\n  ollama pull ${tag}`;
  }

  if (/api key|authentication|401/i.test(text)) {
    return `The provider rejected the credentials for "${model}". Check .env.local.`;
  }

  return text;
}

/** Print everything measurable about one reply. */
function report(res: LlmResponse, elapsedMs: number, requestedCache: CacheHint): void {
  const cost      = estimateCost(res.tokensIn, res.tokensOut, 0, res.model);
  const tokPerSec = res.tokensOut > 0 && elapsedMs > 0
    ? (res.tokensOut / (elapsedMs / 1000)).toFixed(1)
    : "n/a";

  const line = "-".repeat(72);
  console.log(line);
  console.log(res.text || "(empty reply)");
  console.log(line);

  const cacheNote = requestedCache !== "none" && !res.cacheApplied
    ? "   <- hint requested but NOT honoured"
    : "";

  console.log(`provider      ${res.provider}`);
  console.log(`model         ${res.model}`);
  console.log(`tokens        ${res.tokensIn} in / ${res.tokensOut} out`);
  console.log(`cost          ${cost === 0 ? "$0.00 (local - no token bill)" : "$" + cost.toFixed(6)}`);
  console.log(`latency       ${elapsedMs}ms  (${tokPerSec} output tok/s)`);
  console.log(`cache applied ${res.cacheApplied}${cacheNote}`);
  console.log(`stop reason   ${res.stopReason ?? "(none reported)"}`);

  if (res.stopReason === "max_tokens" || res.stopReason === "length") {
    console.log("");
    console.log("WARNING: the reply was cut off by the token ceiling. In learn/chat that");
    console.log("presents as a JSON parse failure, not as a visibly short answer.");
  }
}

/**
 * The question that actually decides whether a model can serve Learn.
 *
 * Run against the real parser, not a lenient stand-in: `parseChatResponse` is
 * already tolerant of Claude's failure modes, so anything it cannot salvage is
 * something a learner would have seen the generic fallback for.
 */
function reportLearnContract(text: string): void {
  console.log("");
  console.log("-".repeat(72));
  console.log("Learn contract check - does the reply parse as learn/chat requires?");

  try {
    const parsed = parseChatResponse(text);
    const ok     = Boolean(parsed.reply.trim());

    console.log(`  parses       ${ok ? "yes" : "no - parser returned an empty reply"}`);
    console.log(`  isOffTopic   ${parsed.isOffTopic}`);
    console.log(`  codeExample  ${parsed.codeExample ? parsed.codeExample.language : "none"}`);
    console.log(`  covered      ${parsed.covered}`);

    if (!ok) {
      console.log("");
      console.log("  This model returned something the tolerant parser could not salvage.");
      console.log("  learn/chat would show its generic fallback to the learner.");
    }
  } catch (err) {
    console.log(`  parses       no - ${err instanceof Error ? err.message : String(err)}`);
    console.log("");
    console.log("  This model cannot serve learn/chat as written.");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.model || !args.prompt) {
    console.error("Both --model and --prompt are required.");
    console.log(HELP);
    process.exit(1);
  }

  if (!isCallableModel(args.model)) {
    // Caught before the environment is loaded or any client is built, so a
    // typo costs nothing and says so immediately.
    console.error(explain(new UnknownModelError(args.model), args.model));
    process.exit(1);
  }

  // Loaded AFTER the imports are evaluated, which is safe only because every
  // adapter builds its client lazily on first call. See the comment on the
  // client factory in lib/llm/providers/anthropic.ts.
  const loaded = loadEnvLocal();
  if (loaded.length === 0 && !isLocalModel(args.model)) {
    console.warn("No .env.local found - a hosted model will almost certainly fail to authenticate.\n");
  }

  const system = args.learn
    ? focusedLearningSystemPrompt(args.learn)
    : args.system ?? undefined;

  const req: LlmRequest = {
    model:     args.model,
    maxTokens: args.maxTokens,
    system,
    messages:  [{ role: "user", content: args.prompt }],
    cache:     args.cache,
  };

  console.log(`-> ${args.model}${args.learn ? `  (Learn prompt: "${args.learn}")` : ""}`);
  console.log(`   ${args.prompt}`);
  console.log("");

  const startedAt = Date.now();

  let res: LlmResponse;
  try {
    res = await complete(req);
  } catch (err) {
    console.error(`\nFAILED after ${Date.now() - startedAt}ms\n`);
    console.error(explain(err, args.model));
    process.exit(1);
  }

  report(res, Date.now() - startedAt, args.cache);
  if (args.learn) reportLearnContract(res.text);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
