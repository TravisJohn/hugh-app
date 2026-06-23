import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRandomPersona } from "@/lib/personas";
import MasteryClient from "./MasteryClient";

interface Props {
  params:       Promise<{ milestoneId: string }>;
  searchParams: Promise<{ returnUrl?: string }>;
}

export default async function MasteryPage({ params, searchParams }: Props) {
  const { milestoneId } = await params;
  const { returnUrl }   = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/mastery/${milestoneId}`);

  // Ownership + data fetch — include track_id so the client can build a
  // reliable fallback URL that always points to the specific board, not /tracker
  const { data: milestone } = await supabase
    .from("milestones")
    .select("id, title, kanban_column, mastery_validated, track_id, tracks!track_id!inner(user_id)")
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

  // Pick a random voice persona for this session's TTS
  const persona = getRandomPersona();

  return (
    <MasteryClient
      milestoneId={milestoneId}
      milestoneTitle={milestone.title as string}
      personaId={persona.id}
      trackId={trackId}
      returnUrl={returnUrl}
    />
  );
}
