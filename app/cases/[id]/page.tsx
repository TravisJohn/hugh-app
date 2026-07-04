import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import { loadCase } from "@/lib/cases/loader";
import CasePlayer from "@/components/cases/CasePlayer";

interface Props {
  params: Promise<{ id: string }>;
}

// One case, server-rendered. Auth-gated, then the full case is read (only this
// one file) and handed to the client player. 404 for an unknown/invalid id.
export default async function CasePage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  await verifyUserAccess(supabase);

  const caseData = await loadCase(id);
  if (!caseData) notFound();

  return <CasePlayer caseData={caseData} backHref="/cases" />;
}
