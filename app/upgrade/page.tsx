import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkSessionQuota, FREE_SESSION_LIMIT } from "@/lib/quota";
import { Lock, Zap } from "lucide-react";

export default async function UpgradePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const quota = await checkSessionQuota(supabase, user.id);
  if (quota.plan === "pro") redirect("/home");

  const resetDate = new Date();
  resetDate.setMonth(resetDate.getMonth() + 1);
  resetDate.setDate(1);
  const resetLabel = resetDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0F1E] px-4">
      <div className="w-full max-w-lg">

        {/* Brand */}
        <div className="mb-8 text-center">
          <Link href="/home">
            <span className="font-serif text-2xl font-semibold text-white">Hugh</span>
          </Link>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-sm">

          {/* Icon */}
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <Lock className="h-6 w-6" />
          </div>

          {/* Heading */}
          <h1 className="text-center text-xl font-bold text-white">
            You&apos;ve used all your free sessions
          </h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-slate-400">
            Free accounts get{" "}
            <span className="font-semibold text-slate-200">
              {FREE_SESSION_LIMIT} sessions per month.
            </span>{" "}
            Your {quota.used} sessions have been used — your next batch resets on{" "}
            <span className="text-slate-300">{resetLabel}</span>.
          </p>

          {/* Usage pills */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {Array.from({ length: FREE_SESSION_LIMIT }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-8 rounded-full ${
                  i < quota.used ? "bg-amber-400" : "bg-slate-700"
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-slate-600">
            {quota.used} of {FREE_SESSION_LIMIT} sessions used
          </p>

          <div className="my-7 border-t border-slate-800" />

          {/* Pro card */}
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-semibold text-white">Hugh Pro</span>
              <span className="ml-auto rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-400">
                Coming soon
              </span>
            </div>
            <ul className="space-y-2.5">
              {[
                "Unlimited practice sessions every month",
                "All interview domains and custom topics",
                "Full session history and progress tracking",
                "Dedicated learning assistant — no restrictions",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-400">
                  <span className="mt-0.5 shrink-0 text-sky-400">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* CTAs */}
          <div className="mt-6 space-y-3">
            <a
              href={`mailto:hello@hugh.app?subject=Hugh Pro — early access&body=Hi, I'd like to upgrade to Hugh Pro. My account email is ${user.email}.`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-all hover:bg-sky-400 hover:shadow-sky-400/30"
            >
              Get early access
            </a>
            <Link
              href="/home"
              className="flex w-full items-center justify-center rounded-xl border border-slate-700/60 px-6 py-3 text-sm text-slate-400 transition-all hover:border-slate-600 hover:text-slate-300"
            >
              Back to dashboard
            </Link>
          </div>

          <p className="mt-5 text-center text-xs text-slate-600">
            Your free sessions reset automatically on the 1st of every month.
          </p>
        </div>
      </div>
    </div>
  );
}
