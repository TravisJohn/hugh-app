import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { topicDomainJudgePrompt, parseClaudeJson } from "@/lib/claude/prompts";
import type { TopicDomainVerdict } from "@/lib/learn/topic-domain";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Entry-point domain gate: judge whether a topic is within Hugh's data &
// analytics domain before any track/session is built. Short classification —
// Haiku is sufficient (repo model-selection guidance).
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { topic?: string };
  const topic = body.topic?.trim();
  if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const prompt = topicDomainJudgePrompt(topic);

  // Retry once on a transient Claude/parse failure, mirroring the refine route.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 250,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const result = parseClaudeJson<Partial<TopicDomainVerdict>>(text);
      const verdict: TopicDomainVerdict = {
        inDomain: result.inDomain !== false, // default allow on a malformed body
        reason: typeof result.reason === "string" ? result.reason : "",
        message: typeof result.message === "string" ? result.message : "",
        suggestions: Array.isArray(result.suggestions)
          ? result.suggestions.filter((s): s is string => typeof s === "string").slice(0, 3)
          : [],
      };
      // An in-domain verdict never carries a reminder, whatever the model echoed.
      if (verdict.inDomain) {
        verdict.message = "";
        verdict.suggestions = [];
      }
      return NextResponse.json(verdict);
    } catch (err) {
      lastErr = err;
    }
  }

  console.error("[dashboard/classify-topic]", lastErr);
  // Fail OPEN: a transient judge error must not block a legitimate data learner.
  const open: TopicDomainVerdict = {
    inDomain: true,
    reason: "classifier-unavailable",
    message: "",
    suggestions: [],
  };
  return NextResponse.json(open);
}
