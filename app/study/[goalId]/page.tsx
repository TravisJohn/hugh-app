import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  TrendingUp, MessageCircle, Mic, ArrowLeft,
  CalendarDays, Lock, Headphones, Code2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/landing/SignOutButton";
import { type LearningGoal } from "@/types";

interface Props {
  params: Promise<{ goalId: string }>;
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default async function StudyPage({ params }: Props) {
  const { goalId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/home");

  // Fetch goal + profile in parallel
  const [{ data: goal }, { data: profile }] = await Promise.all([
    supabase.from("learning_goals").select("*").eq("id", goalId).eq("user_id", user.id).single(),
    supabase.from("profiles").select("plan, is_admin").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!goal) notFound();

  // Check if any milestone in this goal's track is mastery-validated
  let converseUnlocked = false;
  const { data: track } = await supabase
    .from("tracks").select("id").eq("goal_id", goalId).eq("user_id", user.id).maybeSingle();
  if (track) {
    const { count } = await supabase
      .from("milestones")
      .select("id", { count: "exact", head: true })
      .eq("track_id", (track as { id: string }).id)
      .eq("mastery_validated", true);
    converseUnlocked = (count ?? 0) > 0;
  }

  const g       = goal as LearningGoal;
  const initial = (user.email ?? "").split("@")[0]?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative flex h-screen flex-col bg-[#0A0F1E] overflow-hidden">

      {/* ── Breathing background orbs ────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-breathe absolute top-0 left-0 h-[600px] w-[600px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="animate-breathe-delayed absolute bottom-0 right-0 h-[700px] w-[700px] translate-x-1/3 translate-y-1/3 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="animate-breathe-slow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-sky-400/10 blur-3xl" />
      </div>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="relative flex shrink-0 items-center justify-between border-b border-slate-800 px-8 py-3">
        <Link
          href="/home"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft size={14} />
          Dashboard
        </Link>

        <span className="absolute left-1/2 -translate-x-1/2 font-serif text-lg font-semibold text-white">
          Hugh.
        </span>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-300">
            {initial}
          </div>
          <span className="hidden sm:block text-slate-500">{user.email}</span>
          <span className="hidden sm:block text-slate-700">|</span>
          <SignOutButton />
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <main className="relative flex flex-1 flex-col items-center justify-center gap-5 px-6 overflow-hidden">

        {/* Logo — compact */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-sky-400/15 blur-2xl scale-150" />
          <Image
            src="/hugh-logo.png.png"
            alt="Hugh"
            width={80}
            height={80}
            className="relative object-contain drop-shadow-2xl"
            priority
          />
        </div>

        {/* Topic context */}
        <div className="text-center shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 mb-1">
            You&apos;re learning
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">{g.topic}</h1>
          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <CalendarDays size={12} />
            <span>Started {fmt(g.start_date)} · Commit until {fmt(g.end_date)}</span>
          </div>
        </div>

        {/* ── Feature cards — 2 rows of 3 ──────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-2xl shrink-0">

          {/* ── ROW 1: Active features ───────────────────────────────── */}

          {/* Track */}
          <Link
            href={`/study/${goalId}/track`}
            className="group flex flex-col gap-2.5 rounded-2xl border border-green-500/40 bg-green-900/10 p-4 shadow-lg shadow-green-900/20 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-green-400/60 hover:bg-green-900/20 hover:shadow-xl hover:shadow-green-500/20"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/15 text-green-400 transition-transform duration-300 group-hover:scale-110">
              <TrendingUp size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="font-semibold text-slate-100 text-sm">Track</p>
                <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-xs font-semibold text-green-400">
                  Start here
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                See your full learning plan on a kanban board. Move milestones as you grow.
              </p>
            </div>
            <span className="mt-auto text-xs font-semibold text-green-400 transition-all group-hover:text-green-300">
              Open board →
            </span>
          </Link>

          {/* Ask */}
          <Link
            href={`/study/${goalId}/ask`}
            className="group flex flex-col gap-2.5 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-500/50 hover:bg-slate-800/70 hover:shadow-xl hover:shadow-violet-500/10"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 transition-transform duration-300 group-hover:scale-110">
              <MessageCircle size={18} />
            </div>
            <div>
              <p className="font-semibold text-slate-100 text-sm mb-0.5">Ask</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Chat with Hugh — explore ideas, ask questions, or get unstuck on anything.
              </p>
            </div>
            <span className="mt-auto text-xs font-semibold text-violet-400 transition-all group-hover:text-violet-300">
              Start chat →
            </span>
          </Link>

          {/* Converse — locked until a milestone is mastered */}
          {converseUnlocked ? (
            <Link
              href={`/study/${goalId}/track`}
              className="group flex flex-col gap-2.5 rounded-2xl border border-sky-500/40 bg-sky-900/10 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-400/60 hover:bg-sky-900/20 hover:shadow-xl hover:shadow-sky-500/10"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 transition-transform duration-300 group-hover:scale-110">
                <Mic size={18} />
              </div>
              <div>
                <p className="font-semibold text-slate-100 text-sm mb-0.5">Converse</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Revisit mastered topics through Hugh&apos;s situational voice conversations.
                </p>
              </div>
              <span className="mt-auto text-xs font-semibold text-sky-400 transition-all group-hover:text-sky-300">
                Practice now →
              </span>
            </Link>
          ) : (
            <div className="relative flex flex-col gap-2.5 rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4 backdrop-blur-sm cursor-not-allowed select-none">
              <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-600">
                <Lock size={9} />
                Locked
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/60 text-slate-700">
                <Mic size={18} />
              </div>
              <div>
                <p className="font-semibold text-slate-600 text-sm mb-0.5">Converse</p>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Apply what you learn in a situational business conversation with Hugh.
                </p>
              </div>
              <p className="mt-auto text-xs text-slate-700 leading-relaxed">
                Master a milestone to unlock Converse.
              </p>
            </div>
          )}

          {/* ── ROW 2: Coming soon ───────────────────────────────────── */}

          {/* Listen */}
          <div className="relative flex flex-col gap-2.5 rounded-2xl border border-slate-800/40 bg-slate-900/20 p-4 backdrop-blur-sm cursor-not-allowed select-none opacity-60">
            <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-xs text-slate-600">
              Soon
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/60 text-slate-700">
              <Headphones size={18} />
            </div>
            <div>
              <p className="font-semibold text-slate-600 text-sm mb-0.5">Listen</p>
              <p className="text-xs text-slate-700 leading-relaxed">
                Topic audio summaries and expert perspectives, ready when you are.
              </p>
            </div>
          </div>

          {/* Code */}
          <div className="relative flex flex-col gap-2.5 rounded-2xl border border-slate-800/40 bg-slate-900/20 p-4 backdrop-blur-sm cursor-not-allowed select-none opacity-60">
            <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-xs text-slate-600">
              Soon
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/60 text-slate-700">
              <Code2 size={18} />
            </div>
            <div>
              <p className="font-semibold text-slate-600 text-sm mb-0.5">Code</p>
              <p className="text-xs text-slate-700 leading-relaxed">
                Hands-on exercises and coding challenges scoped to what you&apos;re learning.
              </p>
            </div>
          </div>

          {/* Events */}
          <div className="relative flex flex-col gap-2.5 rounded-2xl border border-slate-800/40 bg-slate-900/20 p-4 backdrop-blur-sm cursor-not-allowed select-none opacity-60">
            <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-xs text-slate-600">
              Soon
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/60 text-slate-700">
              <CalendarDays size={18} />
            </div>
            <div>
              <p className="font-semibold text-slate-600 text-sm mb-0.5">Events</p>
              <p className="text-xs text-slate-700 leading-relaxed">
                Live workshops and Q&amp;As with practitioners in your field.
              </p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
