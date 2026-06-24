"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, SkipForward, ArrowRight, Brain, ChevronLeft, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type LearningGoal, type TrackStatus } from "@/types";

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

const FALLBACK_TIPS = [
  "The best learners tie new concepts to real problems they're already solving.",
  "Teaching what you learn — even to yourself — can accelerate retention by up to 50%.",
  "Short, focused sessions beat marathon study. 25 minutes of deep work outperforms 2 hours of distracted reading.",
];

const MAX_QUESTIONS = 5;

type Phase = "asking" | "waiting" | "failed";

export default function RefinementFlow({ topic, endDate, onGoalCreated, onCancel }: Props) {
  const [question, setQuestion]     = useState<string | null>(null);
  const [answers, setAnswers]       = useState<QA[]>([]);
  const [draft, setDraft]           = useState("");
  const [fetching, setFetching]     = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const [phase, setPhase]         = useState<Phase>("asking");
  const [tips, setTips]           = useState<string[]>(FALLBACK_TIPS);
  const [tipIdx, setTipIdx]       = useState(0);
  const [pendingGoal, setPendingGoal] = useState<LearningGoal | null>(null);
  const [apiError, setApiError]   = useState(false);

  // Guards a single terminal transition (ready/failed) — Realtime + the
  // race-guard fetch can both fire, but the goal must only settle once.
  const settledRef = useRef(false);

  // Load first question on mount
  useEffect(() => {
    fetchNextQuestion([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tip rotator during waiting
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(() => {
      setTipIdx(i => (i + 1) % tips.length);
    }, 5000);
    return () => clearInterval(id);
  }, [phase, tips.length]);

  // ── Realtime: watch the goal's track_status while the track builds ────────
  useEffect(() => {
    if (phase !== "waiting" || !pendingGoal) return;

    const goalId   = pendingGoal.id;
    const supabase = createClient();

    const settle = (status: TrackStatus | undefined) => {
      if (settledRef.current) return;
      if (status === "ready") {
        settledRef.current = true;
        onGoalCreated({ ...pendingGoal, track_status: "ready" });
      } else if (status === "failed") {
        settledRef.current = true;
        setPhase("failed");
      }
    };

    const channel = supabase
      .channel(`goal-${goalId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "learning_goals", filter: `id=eq.${goalId}` },
        payload => settle((payload.new as { track_status?: TrackStatus }).track_status),
      )
      .subscribe(status => {
        // Race guard: the track may have finished before the subscription was
        // established. Read the current status once we're connected.
        if (status === "SUBSCRIBED") {
          void supabase
            .from("learning_goals")
            .select("track_status")
            .eq("id", goalId)
            .single()
            .then(({ data }) => settle(data?.track_status as TrackStatus | undefined));
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pendingGoal]);

  // Attempt the /refine call, retrying once. Returns the parsed payload, or
  // null if it failed/was malformed after the retry. Note: a 502 from the route
  // does NOT throw, so we must treat !res.ok and missing fields as failures too
  // — otherwise the asking phase hangs on a disabled "thinking…" state forever.
  async function tryRefine(
    currentAnswers: QA[],
  ): Promise<{ question?: string; done?: boolean } | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/dashboard/refine", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ topic, answers: currentAnswers }),
        });
        if (!res.ok) continue;
        const data = await res.json() as { question?: string; done?: boolean };
        if (data && (data.question || data.done)) return data;
        // Malformed (neither question nor done) — retry.
      } catch {
        // Network error — retry.
      }
    }
    return null;
  }

  async function fetchNextQuestion(currentAnswers: QA[]) {
    setFetching(true);
    setFetchError(false);

    const data = await tryRefine(currentAnswers);
    setFetching(false);

    if (data?.done) {
      enterWaiting(currentAnswers);
      return;
    }
    if (data?.question) {
      setQuestion(data.question);
      return;
    }

    // Failed after retry. Never leave the user on a disabled "thinking…" state.
    setFetchError(true);
    if (currentAnswers.length > 0) {
      // We already have enough context to refine — don't loop on a broken
      // endpoint; advance straight to the build (Waiting) phase.
      enterWaiting(currentAnswers);
    } else {
      // The very first question failed: offer a generic prompt so the learner
      // can still contribute. Answering it advances answers → MAX terminates.
      setQuestion("What specifically are you hoping to achieve by learning this?");
    }
  }

  const enterWaiting = useCallback(async (finalAnswers: QA[]) => {
    settledRef.current = false;
    setPhase("waiting");
    setApiError(false);
    setPendingGoal(null);

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
      // Goal exists with track_status 'pending'; the Realtime effect now waits
      // for the background track build to flip it to 'ready' or 'failed'.
      setPendingGoal(data.goal);
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

  // ── Failed phase ──────────────────────────────────────────────────────────
  if (phase === "failed") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
            <AlertTriangle size={22} className="text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-100">
              We couldn&apos;t build your track
            </p>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Your goal is saved to your library — open it to retry generating the track.
            </p>
          </div>
        </div>

        <button
          onClick={() => pendingGoal && onGoalCreated({ ...pendingGoal, track_status: "failed" })}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 transition-colors"
        >
          Go to my library
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  // ── Waiting phase ─────────────────────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div className="flex flex-col gap-5">
        {/* Building animation */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
            <div className="absolute inset-2 animate-pulse rounded-full bg-amber-500/10" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
              <Brain size={22} className="text-amber-400" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-slate-100">Building your learning track…</p>
            <p className="mt-0.5 text-xs text-slate-500">This usually takes 1–2 minutes</p>
          </div>

          {/* Indeterminate progress shimmer */}
          <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full w-1/3 animate-progress-slide rounded-full bg-amber-500" />
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
      {fetchError && (
        <p className="text-xs text-amber-400/80">
          Hugh had trouble reaching the coach — here&apos;s a question to keep going.
        </p>
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
