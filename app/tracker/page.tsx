import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import TrackerDashboard from "@/components/tracker/TrackerDashboard";
import SignOutButton from "@/components/landing/SignOutButton";
import { type TrackWithStats, type LearningGoal } from "@/types";

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TrackerPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tracker");

  const sp         = searchParams ? await searchParams : {};
  const fromGoalId = typeof sp.from === "string" ? sp.from : null;

  const [tracksResult, goalResult] = await Promise.all([
    supabase
      .from("tracks")
      .select("*, milestones!track_id(id, kanban_column)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),

    fromGoalId
      ? supabase
          .from("learning_goals")
          .select("id, topic")
          .eq("id", fromGoalId)
          .eq("user_id", user.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const backGoal = goalResult.data as Pick<LearningGoal, "id" | "topic"> | null;
  const initial  = (user.email ?? "").split("@")[0]?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex min-h-screen flex-col bg-[#0F172A]">

      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-8 py-4">
        <div className="flex items-center gap-5">
          {/* Back link — goes to the study room if we know where we came from */}
          {backGoal ? (
            <Link
              href={`/study/${backGoal.id}`}
              className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              <ArrowLeft size={14} />
              <span className="max-w-[160px] truncate">{backGoal.topic}</span>
            </Link>
          ) : (
            <Link
              href="/home"
              className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              <ArrowLeft size={14} />
              Dashboard
            </Link>
          )}

          <span className="text-slate-700">|</span>
          <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
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

      <main className="flex-1 px-8 py-10 max-w-6xl mx-auto w-full">
        <TrackerDashboard tracks={(tracksResult.data ?? []) as TrackWithStats[]} />
      </main>
    </div>
  );
}
