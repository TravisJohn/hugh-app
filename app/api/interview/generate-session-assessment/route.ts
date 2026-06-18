import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { generateSessionAssessment } from "@/lib/claude/assessSession";
import type { Room } from "@/types";

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { sessionId: string; room: Room };
  const { sessionId, room } = body;

  if (!sessionId || !room) {
    return NextResponse.json(
      { error: "sessionId and room are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data: questions, error: qError } = await supabase
    .from("questions")
    .select("id, question_text")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  if (qError || !questions?.length) {
    return NextResponse.json(
      { error: "No questions found for this session" },
      { status: 404 },
    );
  }

  const { data: answers, error: aError } = await supabase
    .from("answers")
    .select("question_id, transcript, feedback_text, used_best_answer")
    .in("question_id", questions.map((q) => q.id as string));

  if (aError) {
    return NextResponse.json({ error: "Failed to fetch answers" }, { status: 500 });
  }

  const answerMap = new Map(
    (answers ?? []).map((a) => [a.question_id as string, a]),
  );

  const questionsAndAnswers = questions
    .map((q) => {
      const a = answerMap.get(q.id as string);
      if (!a) return null;
      return {
        question:       q.question_text as string,
        transcript:     a.transcript as string,
        feedback:       (a.feedback_text ?? "") as string,
        usedBestAnswer: a.used_best_answer as boolean,
      };
    })
    .filter((qa): qa is NonNullable<typeof qa> => qa !== null);

  if (!questionsAndAnswers.length) {
    return NextResponse.json(
      { error: "No answered questions found" },
      { status: 404 },
    );
  }

  try {
    const assessment = await generateSessionAssessment(room, questionsAndAnswers);
    return NextResponse.json({ assessment });
  } catch (err) {
    console.error("[generate-session-assessment] error:", err);
    return NextResponse.json(
      { error: "Failed to generate assessment" },
      { status: 502 },
    );
  }
}
