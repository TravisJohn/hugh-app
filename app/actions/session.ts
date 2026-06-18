"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRandomPersona } from "@/lib/personas";
import { isValidRoom, type CoachingMode, type Room } from "@/types";
import { checkSessionQuota } from "@/lib/quota";

const now = () => new Date().toISOString();

export async function createSession(
  room:            Room,
  coachingMode:    CoachingMode = 'active',
  topic?:          string,
  jobDescription?: string,
  skipIntro?:      boolean,
  voiceEnabled?:   boolean,
): Promise<void> {
  console.log('[createSession] start', { room, coachingMode, topic, hasJobDescription: !!jobDescription, skipIntro, voiceEnabled });

  if (!isValidRoom(room)) throw new Error(`Invalid room: ${room}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const quota = await checkSessionQuota(supabase, user.id);
  if (!quota.allowed) redirect("/upgrade");

  const persona = getRandomPersona();

  const { error } = await supabase.from("sessions").insert({
    user_id:         user.id,
    room,
    persona_id:      persona.id,
    status:          "active",
    coaching_mode:   coachingMode,
    question_count:  0,
    topic:           topic           ?? null,
    job_description: jobDescription  ?? null,
    skip_intro:      skipIntro       ?? false,
    voice_enabled:   voiceEnabled    ?? true,
  });

  if (error) throw new Error(`Failed to create session: ${error.message}`);

  console.log('[createSession] success — redirecting to /interview/' + room);
  redirect(`/interview/${room}`);
}

export async function pauseSession(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ status: "paused", ended_at: now() })
    .eq("id", sessionId);
  if (error) throw new Error(`Failed to pause session: ${error.message}`);
  redirect("/home");
}

// Passive mode: fewer than 5 questions answered — pause and show notice
export async function pauseSessionWithNotice(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ status: "paused", ended_at: now() })
    .eq("id", sessionId);
  if (error) throw new Error(`Failed to pause session: ${error.message}`);
  redirect("/home?notice=min5");
}

// Passive mode: 5+ questions answered — mark completed, redirect to summary
export async function completeSession(sessionId: string, room: Room): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ status: "completed", ended_at: now() })
    .eq("id", sessionId);
  if (error) throw new Error(`Failed to complete session: ${error.message}`);
  redirect(`/interview/${room}/summary?session=${sessionId}`);
}
