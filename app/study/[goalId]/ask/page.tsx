import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Milestone as MilestoneIcon, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/landing/SignOutButton";
import HeaderUsage from "@/components/usage/HeaderUsage";
import AskWorkspace from "@/components/learn/AskWorkspace";
import StudyTabs from "@/components/study/StudyTabs";
import { type LearningGoal } from "@/types";

interface Props {
  params:       Promise<{ goalId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StudyAskPage({ params, searchParams }: Props) {
  const { goalId } = await params;
  const sp          = await searchParams;
  const urlMilestone   = typeof sp.milestone   === "string" ? sp.milestone.trim()   : null;
  const urlMilestoneId = typeof sp.milestoneId === "string" ? sp.milestoneId.trim() : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: goal } = await supabase
    .from("learning_goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .single();

  if (!goal) notFound();

  const g = goal as LearningGoal;

  // Resolve the focused milestone: explicit URL param wins, otherwise fall back
  // to the track's persistent focus so the goal stays in view across visits.
  let focusId:    string | null = urlMilestoneId;
  let focusTitle: string | null = urlMilestone;
  if (!focusId) {
    const { data: track } = await supabase
      .from("tracks")
      .select("focus_milestone_id")
      .eq("goal_id", goalId)
      .eq("user_id", user.id)
      .maybeSingle();
    const fid = (track?.focus_milestone_id as string | null) ?? null;
    if (fid) {
      const { data: ms } = await supabase
        .from("milestones")
        .select("id, title")
        .eq("id", fid)
        .maybeSingle();
      if (ms) {
        focusId    = ms.id as string;
        focusTitle = ms.title as string;
      }
    }
  }

  const initial   = (user.email ?? "").split("@")[0]?.[0]?.toUpperCase() ?? "?";
  const chatTopic = focusTitle ? `${g.topic}: ${focusTitle}` : g.topic;

  return (
    <div className="relative flex h-screen flex-col bg-[#0A0F1E] overflow-hidden">

      {/* Breathing orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-breathe absolute top-0 left-0 h-[500px] w-[500px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-violet-500/12 blur-3xl" />
        <div className="animate-breathe-delayed absolute bottom-0 right-0 h-[600px] w-[600px] translate-x-1/3 translate-y-1/3 rounded-full bg-sky-500/8 blur-3xl" />
      </div>

      {/* Header — back goes to the tracker board */}
      <header className="relative flex shrink-0 items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/study/${goalId}/track`}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft size={14} />
            <span className="max-w-[200px] truncate">{g.topic}</span>
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-serif text-base font-semibold text-white">Hugh.</span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <HeaderUsage />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-300">
            {initial}
          </div>
          <span className="hidden sm:block text-slate-500">{user.email}</span>
          <span className="hidden sm:block text-slate-700">|</span>
          <SignOutButton />
        </div>
      </header>

      {/* Tab bar */}
      <StudyTabs goalId={goalId} activeTab="ask" />

      {/* Milestone focus strip — persists with the focused milestone */}
      {focusTitle && (
        <div className="relative shrink-0 flex items-center gap-2.5 border-b border-violet-500/20 bg-violet-500/5 px-6 py-2">
          <MilestoneIcon size={13} className="shrink-0 text-violet-400" />
          <span className="text-xs text-slate-500">Focused on</span>
          <span className="rounded-full bg-violet-900/50 px-2.5 py-0.5 text-xs font-semibold text-violet-300 truncate max-w-xs">
            {focusTitle}
          </span>
          {urlMilestone && (
            <Link
              href={`/study/${goalId}/ask`}
              className="ml-auto shrink-0 text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1"
            >
              <X size={11} />
              Clear focus
            </Link>
          )}
        </div>
      )}

      {/* Chat + checklist side-rail */}
      <AskWorkspace
        topic={chatTopic}
        goalId={goalId}
        milestoneId={focusId ?? undefined}
        milestoneTitle={focusTitle ?? undefined}
      />

    </div>
  );
}
