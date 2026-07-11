import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRandomPersona } from "@/lib/personas";
import MasteryClient from "./MasteryClient";
import MasteryRealtimeClient from "./MasteryRealtimeClient";

interface Props {
  params:       Promise<{ milestoneId: string }>;
  searchParams: Promise<{ returnUrl?: string; classic?: string }>;
}

export default async function MasteryPage({ params, searchParams }: Props) {
  const { milestoneId }       = await params;
  const { returnUrl, classic } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/mastery/${milestoneId}`);

  // Ownership + data fetch — include track_id so the client can build a
  // reliable fallback URL that always points to the specific board, not /tracker
  const { data: milestone } = await supabase
    .from("milestones")
    .select("id, title, kanban_column, mastery_validated, track_id, summary_doc, summary_doc_at, tracks!track_id!inner(user_id)")
    .eq("id", milestoneId)
    .single();

  if (!milestone) redirect(returnUrl ?? "/tracker");

  const trackId = (milestone as { track_id: string }).track_id;

  // Guard: must be in the Mastered (done) column
  if (milestone.kanban_column !== "done") {
    redirect(returnUrl ?? `/tracker/${trackId}`);
  }

  // Guard: must have at least one diary entry
  const { count } = await supabase
    .from("milestone_entries")
    .select("id", { count: "exact", head: true })
    .eq("milestone_id", milestoneId);

  if (!count || count === 0) {
    redirect(returnUrl ?? `/tracker/${trackId}`);
  }

  // Realtime mastery is behind a flag; `?classic=1` is an intentional escape
  // hatch to the original scripted flow (used by the Realtime error UI so we
  // never silently fall back mid-session).
  const realtimeEnabled = process.env.MASTERY_REALTIME_ENABLED === "true";

  if (realtimeEnabled && classic !== "1") {
    const classicUrl =
      `/mastery/${milestoneId}?classic=1` +
      (returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : "");
    return (
      <MasteryRealtimeClient
        milestoneId={milestoneId}
        milestoneTitle={milestone.title as string}
        trackId={trackId}
        returnUrl={returnUrl}
        alreadyMastered={milestone.mastery_validated as boolean}
        classicUrl={classicUrl}
        summaryDoc={(milestone as { summary_doc?: string | null }).summary_doc ?? null}
        summaryDocAt={(milestone as { summary_doc_at?: string | null }).summary_doc_at ?? null}
      />
    );
  }

  // Pick a random voice persona for this session's TTS (classic scripted flow)
  const persona = getRandomPersona();

  return (
    <MasteryClient
      milestoneId={milestoneId}
      milestoneTitle={milestone.title as string}
      personaId={persona.id}
      trackId={trackId}
      returnUrl={returnUrl}
      alreadyMastered={milestone.mastery_validated as boolean}
    />
  );
}
