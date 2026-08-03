import Image from "next/image";
import Link from "next/link";
import { GraduationCap, Code2, Trophy, Cloud, NotebookPen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import SignOutButton from "@/components/landing/SignOutButton";
import HeaderUsage from "@/components/usage/HeaderUsage";

// Top-level activity picker — the post-login landing for every user. Picking
// "Learn" leads to the "What do you want to learn?" dashboard (/home/learn);
// "Code" opens the coding-drill landing (/code/start); "Cases" opens The Case
// Room (/cases); "Cloud Skills" opens the cloud-services reference (/cloud).
export default async function HomePage() {
  const supabase = await createClient();
  const { user } = await verifyUserAccess(supabase);

  const firstName = (user.email ?? "").split("@")[0] ?? "there";
  const initial   = firstName[0]?.toUpperCase() ?? "?";

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
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>

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
      {/* Vertical rhythm scales with viewport height via clamp() rather than a
          fixed gap-8: on a single-screen laptop (~650-700px tall) fixed gaps
          plus the four-card grid and Notes bar don't fit, and overflow-hidden
          was silently clipping the Notes bar off the bottom. clamp() keeps the
          generous spacing on tall/dual-monitor screens while compressing
          smoothly — no breakpoint jump — as height shrinks. */}
      <main className="relative flex flex-1 flex-col items-center justify-center gap-[clamp(0.5rem,3vh,2rem)] px-6 overflow-hidden">

        {/* Logo */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-sky-400/15 blur-2xl scale-150" />
          <Image
            src="/hugh-logo.png.png"
            alt="Hugh"
            width={88}
            height={88}
            className="relative h-[clamp(36px,9vh,88px)] w-[clamp(36px,9vh,88px)] object-contain drop-shadow-2xl"
            priority
          />
        </div>

        {/* Greeting */}
        <div className="text-center shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 mb-1">
            Welcome back, {firstName}
          </p>
          <h1 className="text-[clamp(1.125rem,2.8vh,1.5rem)] font-bold tracking-tight text-slate-100">
            What would you like to do?
          </h1>
        </div>

        {/* ── Four activities: Learn · Code · Cases · Cloud Skills ──── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[clamp(0.5rem,2vh,1rem)] w-full max-w-2xl shrink-0">

          {/* Learn — the whole learning experience */}
          <Link
            href="/home/learn"
            className="group flex flex-col gap-[clamp(0.4rem,1.2vh,0.75rem)] rounded-2xl border border-green-500/40 bg-green-900/10 p-[clamp(0.75rem,2.2vh,1.25rem)] shadow-lg shadow-green-900/20 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-green-400/60 hover:bg-green-900/20 hover:shadow-xl hover:shadow-green-500/20"
          >
            <div className="flex h-[clamp(2rem,4.2vh,2.75rem)] w-[clamp(2rem,4.2vh,2.75rem)] items-center justify-center rounded-xl bg-green-500/15 text-green-400 transition-transform duration-300 group-hover:scale-110">
              <GraduationCap size={22} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <p className="font-semibold text-slate-100 text-base">Learn</p>
                <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-xs font-semibold text-green-400">
                  Start here
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-snug">
                Pick a topic and build real knowledge — follow your track, ask Hugh
                anything, and practise out loud.
              </p>
            </div>
            <span className="mt-auto text-xs font-semibold text-green-400 transition-all group-hover:text-green-300">
              Choose a topic →
            </span>
          </Link>

          {/* Code — timed coding drills */}
          <Link
            href="/code/start"
            className="group flex flex-col gap-[clamp(0.4rem,1.2vh,0.75rem)] rounded-2xl border border-sky-500/40 bg-sky-900/10 p-[clamp(0.75rem,2.2vh,1.25rem)] shadow-lg shadow-sky-900/20 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-400/60 hover:bg-sky-900/20 hover:shadow-xl hover:shadow-sky-500/20"
          >
            <div className="flex h-[clamp(2rem,4.2vh,2.75rem)] w-[clamp(2rem,4.2vh,2.75rem)] items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 transition-transform duration-300 group-hover:scale-110">
              <Code2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <p className="font-semibold text-slate-100 text-base">Code</p>
                <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-xs font-semibold text-sky-400">
                  New
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-snug">
                Short, timed coding reps that build muscle memory — practise what
                you&apos;ve learned or spin up your own drill.
              </p>
            </div>
            <span className="mt-auto text-xs font-semibold text-sky-400 transition-all group-hover:text-sky-300">
              Start coding →
            </span>
          </Link>

          {/* Cases — The Case Room */}
          <Link
            href="/cases"
            className="group flex flex-col gap-[clamp(0.4rem,1.2vh,0.75rem)] rounded-2xl border border-amber-500/40 bg-amber-900/10 p-[clamp(0.75rem,2.2vh,1.25rem)] shadow-lg shadow-amber-900/20 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-400/60 hover:bg-amber-900/20 hover:shadow-xl hover:shadow-amber-500/20"
          >
            <div className="flex h-[clamp(2rem,4.2vh,2.75rem)] w-[clamp(2rem,4.2vh,2.75rem)] items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 transition-transform duration-300 group-hover:scale-110">
              <Trophy size={22} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <p className="font-semibold text-slate-100 text-base">Cases</p>
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-400">
                  New
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-snug">
                Work real business cases in The Case Room — make the calls that
                matter and test your judgment against an expert&apos;s.
              </p>
            </div>
            <span className="mt-auto text-xs font-semibold text-amber-400 transition-all group-hover:text-amber-300">
              Enter the Case Room →
            </span>
          </Link>

          {/* Cloud Skills — cloud-services reference */}
          <Link
            href="/cloud"
            className="group flex flex-col gap-[clamp(0.4rem,1.2vh,0.75rem)] rounded-2xl border border-violet-500/40 bg-violet-900/10 p-[clamp(0.75rem,2.2vh,1.25rem)] shadow-lg shadow-violet-900/20 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-400/60 hover:bg-violet-900/20 hover:shadow-xl hover:shadow-violet-500/20"
          >
            <div className="flex h-[clamp(2rem,4.2vh,2.75rem)] w-[clamp(2rem,4.2vh,2.75rem)] items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 transition-transform duration-300 group-hover:scale-110">
              <Cloud size={22} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <p className="font-semibold text-slate-100 text-base">Cloud Skills</p>
                <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-xs font-semibold text-violet-400">
                  New
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-snug">
                Know your cloud — AWS, GCP and Azure services for data work, grouped by
                what they do, with an assistant to ask anything.
              </p>
            </div>
            <span className="mt-auto text-xs font-semibold text-violet-400 transition-all group-hover:text-violet-300">
              Explore the clouds →
            </span>
          </Link>

        </div>

        {/* Notes — review a wrong answer with Hugh (personal utility) */}
        <Link
          href="/notes"
          className="group flex w-full max-w-2xl shrink-0 items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-900/40 px-4 py-[clamp(0.5rem,1.4vh,0.75rem)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-rose-400/50 hover:bg-slate-900/60"
        >
          <div className="flex h-[clamp(1.75rem,3.6vh,2.25rem)] w-[clamp(1.75rem,3.6vh,2.25rem)] shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400 transition-transform duration-300 group-hover:scale-110">
            <NotebookPen size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-100">Notes</p>
            <p className="truncate text-xs text-slate-500">
              Drop a screenshot of a question you got wrong, jot your thinking, and let Hugh correct it.
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-rose-400 transition-all group-hover:text-rose-300">
            Open →
          </span>
        </Link>
      </main>
    </div>
  );
}
