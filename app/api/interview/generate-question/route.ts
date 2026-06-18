import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  ROOM_CONTEXT,
  questionGenerationPrompt,
  introQuestionBestAnswerPrompt,
  parseClaudeJson,
} from "@/lib/claude/prompts";
import { isPresetRoom, type Room } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INTRO_Q1 =
  "Thanks for coming in today. Let's start — tell me about yourself and your background.";

const INTRO_Q2_POOL = [
  "What drew you to data engineering, data science, or ML engineering specifically?",
  "Walk me through your most technically challenging project.",
  "How do you stay current with tools and developments in this space?",
  "What does your typical workflow look like when you start a new data project?",
];

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    sessionId?:       string;
    room:             Room;
    questionType:     "intro" | "domain";
    questionIndex:    number;
    previousQuestions?: string[];
    topic?:           string;
    jobDescription?:  string;
  };

  const {
    sessionId,
    room,
    questionType,
    questionIndex,
    previousQuestions = [],
    topic,
    jobDescription,
  } = body;

  let question: string;
  let bestAnswer: string;

  try {
    if (questionType === "intro") {
      question =
        questionIndex === 0
          ? INTRO_Q1
          : INTRO_Q2_POOL[Math.floor(Math.random() * INTRO_Q2_POOL.length)];

      const res = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [
          { role: "user", content: introQuestionBestAnswerPrompt(question) },
        ],
      });

      const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
      const parsed = parseClaudeJson<{ bestAnswer: string }>(raw);
      bestAnswer = parsed.bestAnswer;
    } else {
      const topicContext = isPresetRoom(room)
        ? ROOM_CONTEXT[room]
        : topic ?? (jobDescription ? null : "general data and ML engineering");

      const res = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: questionGenerationPrompt(topicContext, previousQuestions, jobDescription),
          },
        ],
      });

      const raw =
        res.content[0].type === "text" ? res.content[0].text : "{}";
      const parsed = parseClaudeJson<{ question: string; bestAnswer: string }>(
        raw
      );
      question = parsed.question;
      bestAnswer = parsed.bestAnswer;
    }
  } catch (err) {
    console.error("[generate-question] Claude error:", err);
    return NextResponse.json(
      { error: "Failed to generate question" },
      { status: 502 }
    );
  }

  // Persist question — non-fatal if session ID absent (dev/test)
  let questionId: string | undefined;
  if (sessionId && userId !== "dev-test-bypass") {
    const supabase = await createClient();
    const { data, error: dbError } = await supabase
      .from("questions")
      .insert({
        session_id:    sessionId,
        question_text: question,
        best_answer:   bestAnswer,
        question_type: questionType,
        order_index:   questionIndex,
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("[generate-question] DB error:", dbError.message);
    } else {
      questionId = data.id as string;
      // Bump session question_count
      await supabase
        .from("sessions")
        .update({ question_count: questionIndex + 1 })
        .eq("id", sessionId);
    }
  }

  return NextResponse.json({ question, bestAnswer, questionId });
}
