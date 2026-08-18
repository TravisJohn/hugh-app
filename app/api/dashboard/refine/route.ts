import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { enforceUsageGate, logUsage } from "@/lib/usage";
import { refinementQuestionPrompt, parseClaudeJson } from "@/lib/claude/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 5-whys refinement question (short conversational gen) — Haiku is sufficient.
// See CLAUDE.md "Model Selection". Kept in one place so the API call and the
// usage log can never disagree about what was billed.
const MODEL = "claude-haiku-4-5";

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usageGate = await enforceUsageGate(userId);
  if (usageGate) return usageGate;

  const body = (await request.json()) as {
    topic:   string;
    answers: Array<{ question: string; answer: string }>;
  };

  const { topic, answers = [] } = body;
  if (!topic?.trim()) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  const prompt = refinementQuestionPrompt(topic, answers);

  // Retry once: the Claude call or JSON parse can fail transiently. A single
  // retry keeps the refinement flow moving without hanging the client.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: 200,
        messages:   [{ role: "user", content: prompt }],
      });
      // Logged per attempt: a failed parse still burned tokens.
      void logUsage({
        userId,
        model:     MODEL,
        feature:   "dashboard/refine",
        tokensIn:  msg.usage.input_tokens,
        tokensOut: msg.usage.output_tokens,
      });
      const text   = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const result = parseClaudeJson<{ question: string; done: boolean }>(text);
      return NextResponse.json(result);
    } catch (err) {
      lastErr = err;
    }
  }

  console.error("[dashboard/refine]", lastErr);
  return NextResponse.json({ error: "Failed to generate question" }, { status: 502 });
}
