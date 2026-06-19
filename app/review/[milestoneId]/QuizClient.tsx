"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Timer, CheckCircle2, XCircle,
  Trophy, RefreshCcw, AlertCircle, ChevronRight,
} from "lucide-react";

interface QuizQuestion {
  question:     string;
  options:      string[];
  correctIndex: number;
  explanation:  string;
}

type Phase = "idle" | "generating" | "quiz" | "results" | "validating";

interface Props {
  milestoneId:    string;
  milestoneTitle: string;
  entryCount:     number;
  returnUrl:      string;
}

const SECONDS_PER_Q = 45;
const OPTION_LABELS = ["A", "B", "C", "D"] as const;

export default function QuizClient({ milestoneId, milestoneTitle, entryCount, returnUrl }: Props) {
  const router = useRouter();

  const [phase, setPhase]           = useState<Phase>("idle");
  const [questions, setQuestions]   = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected]     = useState<number | null>(null);
  const [revealed, setRevealed]     = useState(false);
  const [answers, setAnswers]       = useState<(number | null)[]>([]);
  const [timeLeft, setTimeLeft]     = useState(SECONDS_PER_Q);
  const [genError, setGenError]     = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setTimeLeft(SECONDS_PER_Q);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => (t <= 1 ? 0 : t - 1));
    }, 1000);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  // When timer hits 0, auto-reveal with no answer selected
  useEffect(() => {
    if (timeLeft === 0 && phase === "quiz" && !revealed) {
      clearTimer();
      setRevealed(true);
    }
  }, [timeLeft, phase, revealed, clearTimer]);

  async function handleStart() {
    setGenError(null);
    setPhase("generating");
    try {
      const res = await fetch("/api/tracker/review/quiz", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ milestoneId }),
      });
      const d = await res.json() as { questions?: QuizQuestion[]; error?: string };
      if (!res.ok || !d.questions) {
        setGenError(d.error ?? "Failed to generate quiz. Please try again.");
        setPhase("idle");
        return;
      }
      setQuestions(d.questions);
      setAnswers([]);
      setCurrentIdx(0);
      setSelected(null);
      setRevealed(false);
      setPhase("quiz");
      startTimer();
    } catch {
      setGenError("Network error. Please check your connection and try again.");
      setPhase("idle");
    }
  }

  function handleSelect(idx: number) {
    if (revealed) return;
    clearTimer();
    setSelected(idx);
    setRevealed(true);
  }

  async function doValidate() {
    try {
      await fetch(`/api/tracker/milestones/${milestoneId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reviewValidated: true }),
      });
    } finally {
      // Append validated flag so the board can show the celebration
      const sep  = returnUrl.includes("?") ? "&" : "?";
      router.push(`${returnUrl}${sep}validated=${milestoneId}`);
    }
  }

  function handleNext() {
    const newAnswers = [...answers, selected]; // null = time expired = wrong
    setAnswers(newAnswers);

    if (currentIdx + 1 >= questions.length) {
      const correct = newAnswers.filter((a, i) => a !== null && a === questions[i]?.correctIndex).length;
      if (correct === 5) {
        setPhase("validating");
        doValidate();
      } else {
        setPhase("results");
      }
      return;
    }

    setCurrentIdx(i => i + 1);
    setSelected(null);
    setRevealed(false);
    startTimer();
  }

  const q          = questions[currentIdx];
  const timerPct   = (timeLeft / SECONDS_PER_Q) * 100;
  const timerColor = timeLeft > 15 ? "bg-sky-500" : timeLeft > 7 ? "bg-amber-500" : "bg-red-500";

  // ─── Idle / entry-count gate ───────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col">
        <header className="shrink-0 flex items-center gap-4 border-b border-slate-800 px-6 py-4">
          <button
            onClick={() => router.push(returnUrl)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={15} />
            Back to board
          </button>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg text-center">
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
              <Timer size={26} />
            </div>
            <h1 className="mb-1 text-2xl font-bold text-slate-100">Review Quiz</h1>
            <p className="mb-8 text-sm text-slate-400">{milestoneTitle}</p>

            <div className="mb-8 rounded-2xl border border-slate-700/60 bg-slate-800/50 px-6 py-5 text-left space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">How it works</p>
              {([
                ["5 questions", "scoped entirely to your learning diary for this milestone"],
                ["45 seconds each", "answer before time runs out or it counts as wrong"],
                ["All 5 correct", "required to officially mark this card as reviewed"],
                ["Unlimited retries", "each attempt generates fresh questions — no memorising"],
              ] as const).map(([bold, rest]) => (
                <div key={bold} className="flex items-start gap-3">
                  <ChevronRight size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  <p className="text-sm text-slate-300">
                    <span className="font-semibold text-slate-100">{bold}</span>{" — "}{rest}
                  </p>
                </div>
              ))}
            </div>

            {genError && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
                <p className="text-sm text-red-300">{genError}</p>
              </div>
            )}

            {entryCount === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-5 py-4">
                <p className="text-sm text-slate-400 leading-relaxed">
                  No learning diary entries found for this milestone.
                  <br />
                  Add entries via Ask Hugh or the learning diary before starting the quiz.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-xs text-slate-500">
                  {entryCount} learning {entryCount === 1 ? "entry" : "entries"} available
                </p>
                <button
                  onClick={handleStart}
                  className="w-full rounded-xl bg-amber-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-amber-500 transition-colors"
                >
                  Start Quiz
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Generating questions ─────────────────────────────────────────────────
  if (phase === "generating") {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-amber-400 mx-auto mb-4" />
          <p className="text-sm text-slate-400">Generating your personalised quiz…</p>
          <p className="mt-1 text-xs text-slate-600">Analysing your learning diary entries</p>
        </div>
      </div>
    );
  }

  // ─── Active question ──────────────────────────────────────────────────────
  if (phase === "quiz" && q) {
    const isCorrect = selected !== null && selected === q.correctIndex;

    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col">
        <header className="shrink-0 border-b border-slate-800 px-6 py-4">
          <div className="mx-auto max-w-2xl flex items-center justify-between">
            <button
              onClick={() => { clearTimer(); router.push(returnUrl); }}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft size={14} />
              Quit
            </button>
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Question {currentIdx + 1} / {questions.length}
            </span>
            <div className={`flex items-center gap-1.5 text-sm font-mono font-bold tabular-nums ${
              timeLeft > 15 ? "text-slate-400" : timeLeft > 7 ? "text-amber-400" : "text-red-400"
            }`}>
              <Timer size={13} />
              {timeLeft}s
            </div>
          </div>

          {/* Question progress dots */}
          <div className="mx-auto max-w-2xl mt-3 flex gap-1">
            {questions.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < currentIdx  ? "bg-green-500"
                  : i === currentIdx ? "bg-amber-500"
                  : "bg-slate-700"
                }`}
              />
            ))}
          </div>

          {/* Timer bar */}
          <div className="mx-auto max-w-2xl mt-2 h-0.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${timerColor}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-2xl">
            <p className="mb-8 text-xl font-semibold text-slate-100 leading-relaxed">
              {q.question}
            </p>

            <div className="space-y-3">
              {q.options.map((opt, idx) => {
                let btnStyle: string;
                if (!revealed) {
                  btnStyle = "border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-500 hover:bg-slate-800 cursor-pointer";
                } else if (idx === q.correctIndex) {
                  btnStyle = "border-green-500/70 bg-green-900/30 text-green-200 cursor-default";
                } else if (idx === selected) {
                  btnStyle = "border-red-500/70 bg-red-900/30 text-red-300 cursor-default";
                } else {
                  btnStyle = "border-slate-700/30 bg-slate-800/20 text-slate-600 cursor-default";
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelect(idx)}
                    disabled={revealed}
                    className={`w-full flex items-start gap-4 rounded-xl border px-4 py-4 text-left transition-all duration-150 ${btnStyle}`}
                  >
                    <span className={`mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold
                      ${revealed && idx === q.correctIndex ? "bg-green-500 text-white"
                        : revealed && idx === selected && idx !== q.correctIndex ? "bg-red-500 text-white"
                        : "bg-slate-700 text-slate-400"}`}
                    >
                      {OPTION_LABELS[idx]}
                    </span>
                    <span className="flex-1 text-sm leading-relaxed">{opt}</span>
                    {revealed && idx === q.correctIndex && (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-400" />
                    )}
                    {revealed && idx === selected && idx !== q.correctIndex && (
                      <XCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Explanation + next button — only after answering */}
            {revealed && (
              <div className="mt-6 animate-fadeIn">
                <div className={`mb-4 rounded-xl border px-4 py-3.5 ${
                  selected === null ? "border-amber-500/30 bg-amber-900/20"
                  : isCorrect      ? "border-green-500/30 bg-green-900/20"
                  :                  "border-red-500/30 bg-red-900/20"
                }`}>
                  <p className={`mb-1 text-sm font-semibold ${
                    selected === null ? "text-amber-300" : isCorrect ? "text-green-300" : "text-red-300"
                  }`}>
                    {selected === null ? "⏱ Time's up!" : isCorrect ? "✓ Correct!" : "✗ Incorrect"}
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">{q.explanation}</p>
                </div>

                <button
                  onClick={handleNext}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-600 transition-colors"
                >
                  {currentIdx + 1 >= questions.length ? "See results" : "Next question"}
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Validating (passed — saving to DB) ───────────────────────────────────
  if (phase === "validating") {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400">
            <Trophy size={30} />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-100">Quiz Passed!</h2>
          <p className="mb-1 text-4xl font-black text-green-400">5 / 5</p>
          <p className="mb-6 text-sm text-slate-400">All correct — marking this card as reviewed…</p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            Saving and returning to your board…
          </div>
        </div>
      </div>
    );
  }

  // ─── Results (failed) ─────────────────────────────────────────────────────
  if (phase === "results") {
    const finalCorrect = answers.filter((a, i) => a !== null && a === questions[i]?.correctIndex).length;

    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col">
        <header className="shrink-0 border-b border-slate-800 px-6 py-4">
          <div className="mx-auto max-w-2xl">
            <button
              onClick={() => router.push(returnUrl)}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft size={14} />
              Back to board
            </button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
              <XCircle size={30} />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-slate-100">Almost there</h2>
            <p className="mb-1 text-4xl font-black text-amber-400">{finalCorrect} / 5</p>
            <p className="mb-8 text-sm text-slate-400">
              You need all 5 correct to pass. Review your notes and give it another go.
            </p>

            {/* Per-question breakdown */}
            <div className="mb-8 rounded-2xl border border-slate-700/60 bg-slate-800/50 px-4 py-4 text-left space-y-2.5">
              {questions.map((qItem, i) => {
                const a       = answers[i];
                const correct = a !== null && a === qItem.correctIndex;
                return (
                  <div key={i} className="flex items-center gap-3">
                    {correct
                      ? <CheckCircle2 size={14} className="shrink-0 text-green-400" />
                      : <XCircle      size={14} className="shrink-0 text-red-400"   />
                    }
                    <p className="text-xs text-slate-400 truncate flex-1 min-w-0">{qItem.question}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => router.push(returnUrl)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Back to board
              </button>
              <button
                onClick={handleStart}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
              >
                <RefreshCcw size={14} />
                Retry Quiz
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
