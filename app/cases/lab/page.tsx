import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import { loadLabManifest } from "@/lib/case-lab/loader";
import CaseModeTabs from "@/components/cases/CaseModeTabs";
import CaseLabLanding from "@/components/case-lab/CaseLabLanding";

// The Case Lab feed — a dated index of long-form takeaway cases. Auth-gated like
// the rest of the learner area. Reads only the manifest (each case loads on its
// own page). Zero runtime AI.
export default async function CaseLabPage() {
  const supabase = await createClient();
  await verifyUserAccess(supabase);
  const manifest = await loadLabManifest();

  // Newest first — the dated "file-explorer" feed.
  const cases = [...manifest.cases].sort((a, b) =>
    b.releaseDate.localeCompare(a.releaseDate),
  );

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-slate-200">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link
          href="/home"
          className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft size={14} />
          Home
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>

      <CaseModeTabs active="lab" />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
          Show · The Case Lab
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">
          The Case Lab
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Long-form cases: a real business problem and a full dataset to take away
          and work in your own tools or your favourite AI. When you&apos;re done,
          reveal the expert teaching note and check your thinking.
        </p>

        <CaseLabLanding cases={cases} />
      </main>
    </div>
  );
}
