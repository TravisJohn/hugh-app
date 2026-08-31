"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTrackStatusWatch } from "@/hooks/useTrackStatusWatch";
import { Sparkles, Trash2, Loader2, AlertTriangle, Pencil, RotateCcw } from "lucide-react";
import { type LearningGoal } from "@/types";
import { canRetry, STALL_MS, type BuildState } from "@/lib/tracker/buildState";
import GoalAnswers from "./GoalAnswers";

// The stall rule and the pending/stalled split now live in
// lib/tracker/buildState.ts, shared with the track page and enforced by the
// retry route — so the button appears exactly where the server would accept
// it, and one change moves all three.

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

interface Props {
  goal:     LearningGoal;
  onDelete?: (id: string) => void;
}

export default function GoalCard({ goal, onDelete }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [retrying, setRetrying]     = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // Optimistic: a retry flips the card back to building without waiting for a
  // round trip through the parent's goal list.
  const [rebuilt, setRebuilt]       = useState(false);
  // Computed client-side after mount to avoid an SSR/CSR hydration mismatch
  // (Date.now() differs between render passes).
  const [stalled, setStalled]       = useState(false);

  // Measured from when the build started, not when the goal was created — a
  // retried goal keeps its original created_at, so reading that would mark
  // every rebuild as stalled the instant it began.
  const startedAt = goal.track_started_at ?? goal.created_at;

  useEffect(() => {
    if (goal.track_status !== "pending") return;
    const age = Date.now() - new Date(startedAt).getTime();
    // Fires immediately if already past the threshold (delay clamped to 0), or
    // live when the user is watching a goal cross it. setState stays in the
    // callback, never synchronous in the effect body.
    const t = setTimeout(() => setStalled(true), Math.max(0, STALL_MS - age));
    return () => clearTimeout(t);
  }, [goal.track_status, startedAt]);

  // Once a rebuild is in flight the card follows it with the same watcher the
  // first build uses — realtime, a poll, and a hard timeout — rather than
  // sitting on an optimistic spinner until the learner reloads.
  useTrackStatusWatch({
    goalId:   goal.id,
    active:   rebuilt,
    onReady:  () => router.refresh(),
    onFailed: () => setRebuilt(false),
  });

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res  = await fetch(`/api/dashboard/goals/${goal.id}/retry`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setRetryError(data.error ?? "Could not start the rebuild.");
        return;
      }
      setRebuilt(true);
      setStalled(false);
    } catch {
      setRetryError("Could not reach the server.");
    } finally {
      setRetrying(false);
    }
  }

  async function handleDeleteClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    await fetch(`/api/dashboard/goals/${goal.id}`, { method: "DELETE" });
    onDelete?.(goal.id);
  }

  // Deliberately free of Date.now(): the stall crossing arrives via the effect
  // above, so the first client render matches the server's exactly.
  const status: BuildState = rebuilt
    ? "building"
    : stalled
    ? "stalled"
    : goal.track_status === "pending"
    ? "building"
    : goal.track_status;

  return (
    // flex-wrap, so GoalAnswers can drop its `w-full` panel onto a second line
    // while its trigger button stays inline with the actions. That keeps the
    // open/closed state inside GoalAnswers instead of spreading it across two
    // components here.
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/60 px-5 py-4 transition-colors hover:border-slate-600 hover:bg-slate-800">
      {/* Status icon */}
      <div className="shrink-0">
        {status === "building" ? (
          <Loader2 size={20} className="text-amber-400 animate-spin" />
        ) : status === "failed" || status === "stalled" ? (
          <AlertTriangle size={20} className="text-red-400" />
        ) : status === "awaiting_approval" ? (
          <Pencil size={20} className="text-sky-400" />
        ) : (
          <Sparkles size={20} className="text-amber-400 animate-pulse" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-100 leading-snug">{goal.topic}</p>
        {status === "building" ? (
          <p className="mt-0.5 text-xs text-amber-400/80">Building your track…</p>
        ) : status === "stalled" ? (
          // The server's refusal wins over the generic advice: at the rebuild
          // ceiling, "rebuild to try again" is an instruction that cannot work.
          <p className="mt-0.5 text-xs text-red-400/90">
            {retryError ?? "Track build stopped partway — rebuild to try again."}
          </p>
        ) : status === "failed" ? (
          <p className="mt-0.5 text-xs text-red-400/90">
            {retryError ?? "Track build failed — rebuild to try again."}
          </p>
        ) : status === "awaiting_approval" ? (
          <p className="mt-0.5 text-xs text-sky-400/90">
            Review the topic extracted from your document to build this track.
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-500">
            Started {fmt(goal.start_date)} · Commit until {fmt(goal.end_date)}
          </p>
        )}
      </div>

      {/* What the learner told Hugh when they set this goal up — read it back,
          or delete it. Sits outside the Actions cluster because its expanded
          panel is a sibling that wraps to the row below. */}
      <GoalAnswers goalId={goal.id} topic={goal.topic} />

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-slate-400">Remove goal?</span>
            <button
              onClick={handleDeleteClick}
              disabled={deleting}
              className="flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : null}
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              No
            </button>
          </>
        ) : (
          <button
            onClick={handleDeleteClick}
            className="rounded-lg p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove goal"
          >
            <Trash2 size={14} />
          </button>
        )}

        {canRetry(status) && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            title="Rebuild this track"
            className="flex items-center gap-1.5 rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {retrying
              ? <Loader2 size={13} className="animate-spin" />
              : <RotateCcw size={13} />}
            {retrying ? "Starting…" : "Rebuild"}
          </button>
        )}

        {status === "ready" ? (
          <Link
            href={`/study/${goal.id}/track`}
            className="glow-amber rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400 transition-colors"
          >
            Start →
          </Link>
        ) : (
          <span
            className="cursor-not-allowed rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-slate-500"
            title={
              status === "building"
                ? "Track is still being built"
                : status === "stalled"
                ? "Track build stopped partway — rebuild it"
                : status === "awaiting_approval"
                ? "Review the extracted topic to build this track"
                : "Track build failed"
            }
          >
            Start →
          </span>
        )}
      </div>
    </div>
  );
}
