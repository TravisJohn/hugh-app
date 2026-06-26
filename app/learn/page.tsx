import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/landing/SignOutButton";
import HeaderUsage from "@/components/usage/HeaderUsage";
import TopicSetup from "@/components/learn/TopicSetup";
import ChatWindow from "@/components/learn/ChatWindow";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LearnPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/learn");

  const sp         = await searchParams;
  const topic      = typeof sp.topic === "string" ? sp.topic.trim() : "";
  const fromGoalId = typeof sp.from  === "string" ? sp.from          : null;

  const initial = (user.email ?? "").split("@")[0]?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative flex h-screen flex-col bg-[#0A0F1E] overflow-hidden">

      {/* ── Breathing background orbs ────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-breathe absolute top-0 left-0 h-[600px] w-[600px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="animate-breathe-delayed absolute bottom-0 right-0 h-[700px] w-[700px] translate-x-1/3 translate-y-1/3 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="animate-breathe-slow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-violet-400/8 blur-3xl" />
      </div>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="relative flex shrink-0 items-center justify-between border-b border-slate-800 px-8 py-4">
        <div className="flex items-center gap-5">
          {fromGoalId ? (
            <Link
              href={`/study/${fromGoalId}`}
              className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              <ArrowLeft size={14} />
              <span className="max-w-[160px] truncate">{topic || "Back"}</span>
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
          <HeaderUsage />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-300">
            {initial}
          </div>
          <span className="hidden sm:block text-slate-500">{user.email}</span>
          <span className="hidden sm:block text-slate-700">|</span>
          <SignOutButton />
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {topic ? (
        <>
          {/* Topic bar */}
          <div className="relative shrink-0 flex items-center gap-2.5 border-b border-slate-800/60 bg-slate-900/30 px-8 py-2.5">
            <Lightbulb size={13} className="text-violet-400" />
            <span className="text-xs text-slate-500">Focused on</span>
            <span className="rounded-full bg-violet-900/50 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
              {topic}
            </span>
            <Link
              href={fromGoalId ? `/study/${fromGoalId}` : "/learn"}
              className="ml-auto text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Change topic
            </Link>
          </div>

          {/* Chat */}
          <div className="relative flex flex-col flex-1 min-h-0">
            <ChatWindow topic={topic} />
          </div>
        </>
      ) : (
        <div className="relative flex-1 min-h-0">
          <TopicSetup />
        </div>
      )}
    </div>
  );
}
