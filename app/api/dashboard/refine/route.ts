import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { refinementQuestionPrompt, parseClaudeJson } from "@/lib/claude/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    topic:   string;
    answers: Array<{ question: string; answer: string }>;
  };

  const { topic, answers = [] } = body;
  if (!topic?.trim()) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  try {
    const prompt = refinementQuestionPrompt(topic, answers);
    const msg    = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 200,
      messages:   [{ role: "user", content: prompt }],
    });

    const text   = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const result = parseClaudeJson<{ question: string; done: boolean }>(text);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[dashboard/refine]", err);
    return NextResponse.json({ error: "Failed to generate question" }, { status: 502 });
  }
}
