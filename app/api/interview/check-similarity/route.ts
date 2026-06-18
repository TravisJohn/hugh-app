import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { similarityCheckPrompt, parseClaudeJson } from "@/lib/claude/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      model: "claude-sonnet-4-6",
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: similarityCheckPrompt(bestAnswer, transcript),
        },
      ],
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
