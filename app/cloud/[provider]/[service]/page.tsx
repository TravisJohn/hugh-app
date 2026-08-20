import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import { loadCloudManifest, loadService } from "@/lib/cloud/loader";
import { loadMarginNote } from "@/lib/margin/server";
import { PROVIDER_LABELS, type CloudProvider } from "@/types/cloud";
import ServiceDetail from "@/components/cloud/ServiceDetail";

interface Props {
  params: Promise<{ provider: string; service: string }>;
}

// One service, server-rendered. Auth-gated, then the full write-up is read (only
// this one file). If the id is in the catalog but its detail JSON isn't authored
// yet, we show a friendly "coming soon" rather than a 404, so the landing's other
// cards never dead-end while content is being filled in.
export default async function ServicePage({ params }: Props) {
  const { provider, service } = await params;

  const supabase = await createClient();
  await verifyUserAccess(supabase);

  const data = await loadService(provider, service);
  if (data) {
    // Read here rather than from the pad, so the margin opens already holding
    // what you wrote last time instead of flashing empty on a page whose whole
    // promise is being fast.
    const note = await loadMarginNote(supabase, "cloud", `${provider}/${service}`);
    return <ServiceDetail service={data} initialNote={note?.body ?? ""} />;
  }

  // No detail JSON — is it at least a known service in the manifest?
  const manifest = await loadCloudManifest();
  const stub = manifest.services.find(
    (s) => s.provider === provider && s.id === service,
  );
  if (!stub) notFound();

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-slate-200">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <Link
          href="/cloud"
          className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft size={14} />
          Cloud Skills
        </Link>
        <span className="font-serif text-lg font-semibold text-white">Hugh.</span>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {PROVIDER_LABELS[stub.provider as CloudProvider]}
        </div>
        <h1 className="font-serif text-3xl font-bold text-white">{stub.name}</h1>
        <p className="mt-3 max-w-md text-slate-400">{stub.oneLiner}</p>
        <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-3 text-sm text-slate-500">
          The full write-up for this service is being authored — check back soon.
        </p>
      </main>
    </div>
  );
}
