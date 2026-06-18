import Link from "next/link";
import type { Room } from "@/types";
import QuestionSummaryCard from "./QuestionSummaryCard";

const ROOM_LABELS: Record<Room, string> = {
  data_engineering: "Data Engineering",
  data_science:     "Data Science",
  ml_engineering:   "ML Engineering",
  custom:           "Custom",
};

interface QAItem {
  question:       string;
  bestAnswer:     string;
  transcript:     string;
  feedback:       string;
  usedBestAnswer: boolean;
}

interface Props {
  room:                Room;
  topic?:              string;
  personaName:         string;
  sessionDate:         string;
  questionsAndAnswers: QAItem[];
  assessment:          string;
}

export default function SessionSummary({
  room,
  topic,
  personaName,
  sessionDate,
  questionsAndAnswers,
  assessment,
}: Props) {
  const roomLabel = room === 'custom' && topic ? topic : ROOM_LABELS[room];
  const date = new Date(sessionDate).toLocaleDateString("en-US", {
    month: "long",
    day:   "numeric",
    year:  "numeric",
  });

  return (
    <div className="min-h-screen overflow-y-auto bg-[#0F172A] text-white">
      <div className="mx-auto max-w-3xl px-8 py-12">

        {/* Page header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-white">Session Summary</h1>
          <p className="mt-1 text-sm text-slate-400">
            {personaName}&nbsp;&middot;&nbsp;{roomLabel}&nbsp;&middot;&nbsp;
            {date}&nbsp;&middot;&nbsp;{questionsAndAnswers.length} question
            {questionsAndAnswers.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Overall assessment card */}
        <div className="mb-10 rounded-lg border border-slate-700 bg-slate-800/50 border-l-4 border-l-[#38BDF8] px-6 py-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Overall Assessment
          </p>
          <p className="text-sm leading-relaxed text-slate-200">{assessment}</p>
        </div>

        {/* Per-question cards */}
        <div className="flex flex-col gap-6">
          {questionsAndAnswers.map((qa, i) => (
            <QuestionSummaryCard
              key={i}
              index={i + 1}
              question={qa.question}
              transcript={qa.transcript}
              bestAnswer={qa.bestAnswer}
              feedbackText={qa.feedback}
              usedBestAnswer={qa.usedBestAnswer}
            />
          ))}
        </div>

        {/* Footer nav */}
        <div className="mt-12">
          <Link
            href="/"
            className="inline-block rounded-lg border border-slate-600 px-6 py-3 text-sm text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
          >
            Back to Room Selection
          </Link>
        </div>

      </div>
    </div>
  );
}
