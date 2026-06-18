import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPersonaById } from "@/lib/personas";
import { isValidRoom, type Room } from "@/types";
import { generateSessionAssessment } from "@/lib/claude/assessSession";
import SessionSummary from "@/components/interview/SessionSummary";

interface Props {
  params:       Promise<{ room: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SummaryPage({ params, searchParams }: Props) {
  const [{ room: roomParam }, sp] = await Promise.all([params, searchParams]);

  const sessionId = typeof sp.session === "string" ? sp.session : null;

  if (!isValidRoom(roomParam) || !sessionId) redirect("/");
  const room = roomParam as Room;

  const supabase  = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch session and verify ownership
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) redirect("/");

  const persona = getPersonaById(session.persona_id as string);

  // Fetch questions ordered by position
  const { data: questions } = await supabase
    .from("questions")
    .select("id, question_text, best_answer, order_index")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  if (!questions?.length) redirect("/");

  const questionIds = questions.map((q) => q.id as string);

  // Fetch answers for those questions
  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, transcript, feedback_text, used_best_answer")
    .in("question_id", questionIds);

  const answerMap = new Map(
    (answers ?? []).map((a) => [a.question_id as string, a]),
  );

  // Build combined Q&A items — only questions that have been answered
  const questionsAndAnswers = questions
    .map((q) => {
      const a = answerMap.get(q.id as string);
      if (!a) return null;
      return {
        question:       q.question_text as string,
        bestAnswer:     q.best_answer   as string,
        transcript:     a.transcript    as string,
        feedback:       (a.feedback_text ?? "") as string,
        usedBestAnswer: a.used_best_answer as boolean,
      };
    })
    .filter((qa): qa is NonNullable<typeof qa> => qa !== null);

  if (!questionsAndAnswers.length) redirect("/");

  // Generate overall assessment via Claude (server-side, no API round-trip needed)
  let assessment = "";
  try {
    assessment = await generateSessionAssessment(
      room,
      questionsAndAnswers.map(({ question, transcript, feedback, usedBestAnswer }) => ({
        question,
        transcript,
        feedback,
        usedBestAnswer,
      })),
    );
  } catch (err) {
    console.error("[summary] assessment generation failed:", err);
    assessment =
      "Unable to generate an overall assessment. See individual feedback below.";
  }

  return (
    <SessionSummary
      room={room}
      personaName={persona?.name ?? "Your interviewer"}
      sessionDate={session.started_at as string}
      questionsAndAnswers={questionsAndAnswers}
      assessment={assessment}
    />
  );
}
