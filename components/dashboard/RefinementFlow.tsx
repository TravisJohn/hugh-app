"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, SkipForward, ArrowRight, Brain, ChevronLeft } from "lucide-react";
import { type LearningGoal } from "@/types";

interface QA {
  question: string;
  answer:   string;
}

interface Props {
  topic:         string;
  endDate:       string;
  onGoalCreated: (goal: LearningGoal) => void;
  onCancel:      () => void;
}

const STAGES = [
  "Analyzing your learning goals…",
  "Crafting your personalized path…",
  "Preparing expert insights…",
  "Finishing up…",
] as const;

const FALLBACK_TIPS = [
  "The best learners tie new concepts to real problems they're already solving.",
  "Teaching what you learn — even to yourself — can accelerate retention by up to 50%.",
  "Short, focused sessions beat marathon study. 25 minutes of deep work outperforms 2 hours of distracted reading.",
];

const MAX_QUESTIONS = 5;

export default function RefinementFlow({ topic, endDate, onGoalCreated, onCancel }: Props) {
  const [question, setQuestion]     = useState<string | null>(null);
  const [answers, setAnswers]       = useState<QA[]>([]);
  const [draft, setDraft]           = useState("");
  const [fetching, setFetching]     = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const [phase, setPhase]         = useState<"asking" | "waiting">("asking");
  const [stageIdx, setStageIdx]   = useState(0);
  const [tips, setTips]           = useState<string[]>(FALLBACK_TIPS);
  const [tipIdx, setTipIdx]       = useState(0);
  const [goalReady, setGoalReady] = useState<LearningGoal | null>(null);
  const [apiError, setApiError]   = useState(false);

  // Load first question on mount
  useEffect(() => {
    fetchNextQuestion([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stage ticker during waiting
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(() => {
      setStageIdx(i => Math.min(i + 1, STAGES.length - 1));
    }, 2400);
    return () => clearInterval(id);
  }, [phase]);

  // Tip rotator during waiting
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(() => {
      setTipIdx(i => (i + 1) % tips.length);
    }, 5000);
    return () => clearInterval(id);
  }, [phase, tips.length]);

  // Complete when both stage finished + API returned
  useEffect(() => {
    if (goalReady && stageIdx >= STAGES.length - 1) {
      const t = setTimeout(() => onGoalCreated(goalReady), 500);
      return () => clearTimeout(t);
    }
  }, [goalReady, stageIdx, onGoalCreated]);

  async function fetchNextQuestion(currentAnswers: QA[]) {
    setFetching(true);
    setFetchError(false);
    try {
      const res  = await fetch("/api/dashboard/refine", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ topic, answers: currentAnswers }),
      });
      const data = await res.json() as { question?: string; done?: boolean; error?: string };
      if (data.done) {
        enterWaiting(currentAnswers);
      } else {
        setQuestion(data.question ?? null);
      }
    } catch {
      setFetchError(true);
      setQuestion("What specifically are you hoping to achieve by learning this?");
    } finally {
      setFetching(false);
    }
  }

  const enterWaiting = useCallback(async (finalAnswers: QA[]) => {
    setPhase("waiting");
    setStageIdx(0);
    setApiError(false);

    try {
      const res  = await fetch("/api/dashboard/goals", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ topic, end_date: endDate, answers: finalAnswers }),
      });
      const data = await res.json() as { goal?: LearningGoal; tips?: string[]; error?: string };

      if (!res.ok || !data.goal) {
        setApiError(true);
        setPhase("asking");
        return;
      }

      if (data.tips && data.tips.length > 0) setTips(data.tips);
      setGoalReady(data.goal);
    } catch {
      setApiError(true);
      setPhase("asking");
    }
  }, [topic, endDate]);

  async function submitAnswer() {
    const text = draft.trim();
    if (!text || fetching || !question) return;

    const newAnswers = [...answers, { question, answer: text }];
    setAnswers(newAnswers);
    setDraft("");
    setQuestion(null);

    if (newAnswers.length >= MAX_QUESTIONS) {
      enterWaiting(newAnswers);
    } else {
      await fetchNextQuestion(newAnswers);
    }
  }

  function handleSkip() {
    enterWaiting(answers);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") submitAnswer();
  }

  // ── Waiting phase ─────────────────────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div className="flex flex-col gap-5">
        {/* Stage animation */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
            <div className="absolute inset-2 animate-pulse rounded-full bg-amber-500/10" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
              <Brain size={22} className="text-amber-400" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-slate-100">{STAGES[stageIdx]}</p>
            <p className="mt-0.5 text-xs text-slate-500">This usually takes 1–2 minutes</p>
          </div>

          {/* Stage progress dots */}
          <div className="flex gap-1.5">
            {STAGES.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-700 ${
                  i <= stageIdx ? "w-6 bg-amber-500" : "w-3 bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Rotating expert tip */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-amber-500/70">
            Expert insight
          </p>
          <p
            key={tipIdx}
            className="text-sm text-slate-300 leading-relaxed animate-fadeIn"
          >
            {tips[tipIdx]}
          </p>
        </div>
      </div>
    );
  }

  // ── Asking phase ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <ChevronLeft size={12} />
          Back
        </button>

        <div className="flex flex-1 items-center justify-center gap-1.5">
          <span className="text-xs text-slate-600">Refining</span>
          <div className="flex gap-1">
            {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-all ${
                  i < answers.length ? "bg-amber-500" : "bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleSkip}
          className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <SkipForward size={12} />
          Skip
        </button>
      </div>

      {/* Question card */}
      <div className="min-h-[68px] rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
        {fetching || !question ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 size={13} className="animate-spin" />
            <span className="text-sm">Hugh is thinking…</span>
          </div>
        ) : (
          <p className="text-sm text-slate-200 leading-relaxed">{question}</p>
        )}
      </div>

      {/* Error notice */}
      {apiError && (
        <p className="text-xs text-red-400">Something went wrong — please try again.</p>
      )}

      {/* Answer input */}
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={fetching || !question}
        placeholder="Your answer…"
        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
        autoFocus
      />

      {/* Answer button */}
      <button
        onClick={submitAnswer}
        disabled={!draft.trim() || fetching || !question}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Answer
        <ArrowRight size={14} />
      </button>

      {/* Footer nudge */}
      <p className="text-center text-xs text-slate-600 leading-relaxed">
        80% of users with a refined goal complete their learning track — skip anytime.
      </p>
    </div>
  );
}
