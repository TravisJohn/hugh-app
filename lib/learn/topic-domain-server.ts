import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { topicDomainJudgePrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { type TopicDomainVerdict } from "@/lib/learn/topic-domain";
import { logUsage } from "@/lib/usage";

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
      return verdict;
    } catch (err) {
      lastErr = err;
    }
  }

  console.error("[topic-domain-server] judge failed:", lastErr);
  bill();
  return openVerdict();
}
