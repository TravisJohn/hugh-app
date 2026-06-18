import { redirect } from "next/navigation";
import { createClient }  from "@/lib/supabase/server";
import { getPersonaById } from "@/lib/personas";
import { isValidRoom, type CoachingMode, type Room, type ClientPersona } from "@/types";
import InterviewRoom from "@/components/interview/InterviewRoom";

interface Props {
  params: Promise<{ room: string }>;
}

export default async function InterviewPage({ params }: Props) {
  const { room: roomParam } = await params;

  if (!isValidRoom(roomParam)) redirect("/");

  const room      = roomParam as Room;
  const supabase  = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the most recent active session for this user + room
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("room", room)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (!session) redirect("/interview");

  const persona = getPersonaById(session.persona_id as string);
  if (!persona) redirect("/interview");

  // Strip voiceId before handing to the client — it must stay server-only.
  // TTS calls use personaId; the route resolves voiceId server-side.
  const clientPersona: ClientPersona = {
    id:      persona.id,
    name:    persona.name,
    role:    persona.role,
    company: persona.company,
    avatar:  persona.avatar,
  };

  const coachingMode   = (session.coaching_mode  ?? 'active') as CoachingMode;
  const topic          = (session.topic           as string  | null) ?? undefined;
  const jobDescription = (session.job_description as string  | null) ?? undefined;
  const skipIntro      = (session.skip_intro      as boolean | null) ?? false;
  const voiceEnabled   = (session.voice_enabled   as boolean | null) ?? true;

  return (
    <InterviewRoom
      sessionId={session.id as string}
      room={room}
      persona={clientPersona}
      coachingMode={coachingMode}
      topic={topic}
      jobDescription={jobDescription}
      skipIntro={skipIntro}
      voiceEnabled={voiceEnabled}
    />
  );
}
