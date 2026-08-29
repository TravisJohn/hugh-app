import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { topicDomainJudgePrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { type TopicDomainVerdict } from "@/lib/learn/topic-domain";
import { logUsage } from "@/lib/usage";
import { recordOperation } from "@/lib/observability/record";
import { messageOf } from "@/lib/observability/sanitize";
import { logSafeError } from "@/lib/observability/log";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model for the domain gate — see CLAUDE.md "Model Selection". Declared once
// so the API call and the usage log cannot disagree about what was billed.
const MODEL = "claude-haiku-4-5";

function openVerdict(): TopicDomainVerdict {
  return { inDomain: true, reason: "classifier-unavailable", message: "", suggestions: [] };
}

/**
 * Server-side core of the topic domain gate (see `lib/learn/topic-domain.ts`
 * for the client-facing fetch wrapper and the full domain-gate rationale).
 * Factored out so it can be called in-process — no HTTP round-trip — by any
 * server route that already has a candidate topic, not just the
 * `classify-topic` route. Used by the document-upload `extract` route
 * (PRD-course-from-document.md §6 layer 3) to gate document-derived topics
 * the same way a typed topic is gated.
 *
 * Fails OPEN on any network/parse error so a transient classifier failure
 * never blocks a legitimate learner.
 *
 * `userId` is required, not optional: this call spends tokens at every call
 * site, and an optional parameter is how a future caller forgets to bill them.
 */
export async function judgeTopicDomain(
  topic:  string,
  userId: string,
): Promise<TopicDomainVerdict> {
  const prompt = topicDomainJudgePrompt(topic);

  const startedAt = Date.now();

  let lastErr: unknown = null;
  // Accumulated across attempts: a discarded first attempt still costs money.
  let tokensIn  = 0;
  let tokensOut = 0;

  const bill = () => {
    if (tokensIn === 0 && tokensOut === 0) return;
    void logUsage({ userId, model: MODEL, feature: "learn/topic-domain", tokensIn, tokensOut });
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: 250,
        messages:   [{ role: "user", content: prompt }],
      });
      tokensIn  += msg.usage.input_tokens;
      tokensOut += msg.usage.output_tokens;
      const text   = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const result = parseClaudeJson<Partial<TopicDomainVerdict>>(text);
      const verdict: TopicDomainVerdict = {
        inDomain: result.inDomain !== false,
        reason: typeof result.reason === "string" ? result.reason : "",
        message: typeof result.message === "string" ? result.message : "",
        suggestions: Array.isArray(result.suggestions)
          ? result.suggestions.filter((s): s is string => typeof s === "string").slice(0, 3)
          : [],
      };
      if (verdict.inDomain) {
        verdict.message = "";
        verdict.suggestions = [];
      }
      bill();
      // 'refused' for an off-domain topic: the gate turning someone away is
      // the gate working, and counting it as a failure would make a week of
      // off-topic requests read as an outage.
      await recordOperation({
        userId,
        operation:  "topic.gate",
        outcome:    verdict.inDomain ? "ok" : "refused",
        durationMs: Date.now() - startedAt,
        detail:     { attempts: attempt + 1 },
      });
      return verdict;
    } catch (err) {
      lastErr = err;
    }
  }

  logSafeError("topic-domain-server judge", lastErr, [topic]);
  bill();

  // THE SILENT FAILURE. Both attempts are gone and this returns "in domain",
  // so the learner sees nothing wrong and their topic goes straight through —
  // the gate has stopped gating and nobody would ever report it. Recorded as
  // 'failed' even though the request succeeds, which is the entire reason
  // operations are tracked separately from spend and engagement.
  //
  // Wrapped in a named error so error_class groups on the operational meaning
  // ("the classifier is unavailable") rather than on whichever network error
  // happened to surface, while the original message survives in the note.
  const unavailable  = new Error(`classifier unavailable: ${messageOf(lastErr)}`);
  unavailable.name   = "ClassifierUnavailable";

  await recordOperation({
    userId,
    operation:  "topic.gate",
    outcome:    "failed",
    durationMs: Date.now() - startedAt,
    error:      unavailable,
    redact:     [topic],
    detail:     { failedOpen: true, attempts: 2 },
  });

  return openVerdict();
}
