import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { enforceUsageGate, logUsage } from "@/lib/usage";
import { similarityCheckPrompt, parseClaudeJson } from "@/lib/claude/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Pure classification (alignment judgment) — Haiku handles this well at 1/5 the cost.
// See CLAUDE.md "Model Selection". Kept in one place so the API call and
// the usage log can never disagree about what was billed.
const MODEL = "claude-haiku-4-5";

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usageGate = await enforceUsageGate(userId);
  if (usageGate) return usageGate;

  const body = (await request.json()) as {
    bestAnswer: string;
    transcript: string;
  };

  const { bestAnswer, transcript } = body;

  if (!bestAnswer || !transcript) {
    return NextResponse.json(
      { error: "bestAnswer and transcript are required" },
      { status: 400 }
    );
  }

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: similarityCheckPrompt(bestAnswer, transcript),
        },
      ],
    });

    void logUsage({
      userId,
      model:     MODEL,
      feature:   "interview/check-similarity",
      tokensIn:  res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
    const parsed = parseClaudeJson<{
      usedBestAnswer: boolean;
      alignmentScore: number;
    }>(raw);

    // Enforce threshold: score >= 90 means usedBestAnswer
    const alignmentScore = Math.max(0, Math.min(100, parsed.alignmentScore));
    const usedBestAnswer = alignmentScore >= 90;

    return NextResponse.json({ usedBestAnswer, alignmentScore });
  } catch (err) {
    console.error("[check-similarity] Claude error:", err);
    return NextResponse.json(
      { error: "Failed to check similarity" },
      { status: 502 }
    );
  }
}
