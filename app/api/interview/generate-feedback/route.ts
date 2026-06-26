import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { submitAnswerPrompt, parseClaudeJson } from "@/lib/claude/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    questionId?: string;
    question: string;
    bestAnswer: string;
    transcript: string;
    viewedHint: boolean;
    viewedBestAnswer: boolean;
  };

  const {
    questionId,
    question,
    bestAnswer,
    transcript,
    viewedHint,
    viewedBestAnswer,
  } = body;

  if (!question || !bestAnswer || !transcript) {
    return NextResponse.json(
      { error: "question, bestAnswer, and transcript are required" },
      { status: 400 }
    );
  }

  // Default false if callers omit the flag (backwards compat)
  const hintWasViewed = viewedHint ?? false;

  let feedback: string;
  let usedBestAnswer: boolean;
  let alignmentScore: number;

  try {
    // Merged judgment + feedback in one Sonnet call (formerly check-similarity
    // then generate-feedback, which duplicated question/bestAnswer/transcript).
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: submitAnswerPrompt({
            question,
            bestAnswer,
            transcript,
            viewedHint: hintWasViewed,
            viewedBestAnswer,
          }),
        },
      ],
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
    const parsed = parseClaudeJson<{
      usedBestAnswer: boolean;
      alignmentScore: number;
      feedback: string;
    }>(raw);

    alignmentScore = Math.max(0, Math.min(100, parsed.alignmentScore ?? 0));
    usedBestAnswer = alignmentScore >= 90;
    feedback = (parsed.feedback ?? "No feedback generated.").replace(/\*\*/g, "");
  } catch (err) {
    console.error("[generate-feedback] Claude error:", err);
    return NextResponse.json(
      { error: "Failed to generate feedback" },
      { status: 502 }
    );
  }

  // Persist answer — non-fatal if questionId absent (dev/test)
  if (questionId && userId !== "dev-test-bypass") {
    const supabase = await createClient();
    const { error: dbError } = await supabase.from("answers").insert({
      question_id:        questionId,
      transcript,
      viewed_best_answer: viewedBestAnswer,
      used_best_answer:   usedBestAnswer,
      feedback_text:      feedback,
    });

    if (dbError) {
      console.error("[generate-feedback] DB error:", dbError.message);
    }
  }

  return NextResponse.json({ feedback, usedBestAnswer, alignmentScore });
}
