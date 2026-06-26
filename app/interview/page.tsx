import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SessionSetupForm from "@/components/landing/SessionSetupForm";
import SignOutButton from "@/components/landing/SignOutButton";
import HeaderUsage from "@/components/usage/HeaderUsage";
import LandingNotice from "@/components/landing/LandingNotice";

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InterviewPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/interview");

  const sp         = searchParams ? await searchParams : {};
  const showNotice = sp.notice === "min5";

  const initial = (user.email ?? "").split("@")[0]?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex min-h-screen flex-col bg-[#0F172A]">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-8 py-4">
        <div className="flex items-center gap-6">
          <Link href="/home" className="font-bold text-xl text-white tracking-tight hover:text-slate-300 transition-colors">
            Hugh
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/interview"
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-100 bg-slate-800"
            >
              Interview
            </Link>
            <Link
              href="/tracker"
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Tracker
            </Link>
            <Link
              href="/learn"
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Learn
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <HeaderUsage />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-200">
            {initial}
          </div>
          <span className="text-slate-400">{user.email}</span>
          <span className="text-slate-700">|</span>
          <SignOutButton />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-10 px-4 py-10">
        {showNotice && <LandingNotice />}
        <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-300">
          Enter a room.&nbsp; Face the interview.&nbsp; Get better.
        </h1>
        <SessionSetupForm />
      </main>
    </div>
  );
}
