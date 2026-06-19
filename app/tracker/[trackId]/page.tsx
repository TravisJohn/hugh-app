import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import KanbanBoard from "@/components/tracker/KanbanBoard";
import { type Milestone } from "@/types";

interface Props {
  params:       Promise<{ trackId: string }>;
  searchParams: Promise<{ validated?: string; mastered?: string }>;
}

export default async function TrackPage({ params, searchParams }: Props) {
  const { trackId }           = await params;
  const { validated, mastered } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tracker");

  const [{ data: track }, { data: profile }, { data: milestones }] = await Promise.all([
    supabase.from("tracks").select("*").eq("id", trackId).eq("user_id", user.id).single(),
    supabase.from("profiles").select("plan, is_admin").eq("user_id", user.id).maybeSingle(),
    supabase.from("milestones").select("*").eq("track_id", trackId).order("position", { ascending: true }),
  ]);

  if (!track) notFound();

  const isPremium = (profile?.plan === "pro") || (profile?.is_admin === true);
  const isAdmin   = profile?.is_admin === true;

  return (
    <div className="flex h-screen flex-col bg-[#0F172A] overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-800 px-6 py-4">
        <Link
          href="/tracker"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Tracker
        </Link>
        <span className="text-slate-700">/</span>
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 mr-2">
            {track.topic_description}
          </span>
          <span className="text-sm font-semibold text-slate-100">{track.title}</span>
        </div>
      </header>

      {/* Board */}
      <div className="flex-1 overflow-hidden px-6 py-5">
        <KanbanBoard
          initialMilestones={(milestones ?? []) as Milestone[]}
          topicContext={track.topic_description as string}
          validatedId={validated}
          masteredId={mastered}
          isPremium={isPremium}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
