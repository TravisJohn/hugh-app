import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/landing/SignOutButton";
import KanbanBoard from "@/components/tracker/KanbanBoard";
import StudyTabs from "@/components/study/StudyTabs";
import { type LearningGoal, type Track, type Milestone } from "@/types";

interface Props {
  params:       Promise<{ goalId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StudyTrackPage({ params, searchParams }: Props) {
  const { goalId } = await params;
  const sp      = await searchParams;
  const pulseId = typeof sp.pulse === "string" ? sp.pulse : undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: goal }, { data: track }] = await Promise.all([
    supabase
      .from("learning_goals")
      .select("*")
      .eq("id", goalId)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("tracks")
      .select("*")
      .eq("goal_id", goalId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!goal) notFound();

  const g       = goal as LearningGoal;
  const t       = track as Track | null;
  const initial = (user.email ?? "").split("@")[0]?.[0]?.toUpperCase() ?? "?";

  // Load milestones only if a linked track exists
  let milestones: Milestone[] = [];
  if (t) {
    const { data: ms } = await supabase
      .from("milestones")
      .select("*")
      .eq("track_id", t.id)
      .order("position", { ascending: true });
    milestones = (ms ?? []) as Milestone[];
  }

  return (
    <div className="flex h-screen flex-col bg-[#0F172A] overflow-hidden">

      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/study/${goalId}`}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft size={14} />
            <span className="max-w-[200px] truncate">{g.topic}</span>
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-serif text-base font-semibold text-white">Hugh.</span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-200">
            {initial}
          </div>
          <span className="hidden sm:block text-slate-400">{user.email}</span>
          <span className="hidden sm:block text-slate-700">|</span>
          <SignOutButton />
        </div>
      </header>

      {/* Tab bar */}
      <StudyTabs goalId={goalId} activeTab="track" />

      {t ? (
        <>
          {/* Track context bar */}
          <div className="shrink-0 flex items-center gap-3 border-b border-slate-800/60 bg-slate-900/30 px-6 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">
              {t.topic_description}
            </span>
            <span className="text-slate-700">/</span>
            <span className="text-xs font-semibold text-slate-400">{t.title}</span>
            <Link
              href={`/tracker/${t.id}`}
              className="ml-auto flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              <LayoutDashboard size={11} />
              Full view
            </Link>
          </div>

          {/* Kanban board */}
          <div className="flex-1 overflow-hidden px-6 py-5">
            <KanbanBoard initialMilestones={milestones} topicContext={g.topic} goalId={goalId} pulseId={pulseId} />
          </div>
        </>
      ) : (
        /* No linked track — shouldn't happen for new goals, graceful fallback for old ones */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-base font-semibold text-slate-300">Track not ready yet</p>
          <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
            Your learning plan may still be generating. Refresh in a moment, or create one manually from the tracker.
          </p>
          <div className="flex gap-3">
            <Link
              href={`/study/${goalId}/track`}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              Refresh
            </Link>
            <Link
              href="/tracker"
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 transition-colors"
            >
              Go to Tracker
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
