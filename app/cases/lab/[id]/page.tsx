import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import { loadLabCase } from "@/lib/case-lab/loader";
import CaseLabDetail from "@/components/case-lab/CaseLabDetail";

interface Props {
  params: Promise<{ id: string }>;
}

// A single long-form case: brief + guiding questions + dataset (schema, static
// sample preview, CSV download) + a reveal-on-demand teaching note. Fully static.
export default async function CaseLabCasePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  await verifyUserAccess(supabase);

  const c = await loadLabCase(id);
  if (!c) notFound();

  return <CaseLabDetail c={c} />;
}
