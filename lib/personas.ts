import "server-only";

import type { Persona } from "@/types";

// Personas are static for v1. voiceId maps to server-side ElevenLabs env vars.
// Import this file only in Server Components, API routes, or Server Actions.
export const PERSONAS: Persona[] = [
  {
    id:      "marcus",
    name:    "Marcus",
    role:    "Senior Data Engineer",
    company: "FinTech startup",
    voiceId: process.env.ELEVENLABS_VOICE_ID_1 ?? "",
    avatar:  "/personas/marcus.png",
  },
  {
    id:      "sarah",
    name:    "Sarah",
    role:    "Lead Data Scientist",
    company: "Retail analytics firm",
    voiceId: process.env.ELEVENLABS_VOICE_ID_2 ?? "",
    avatar:  "/personas/sarah.png",
  },
  {
    id:      "james",
    name:    "James",
    role:    "ML Engineering Manager",
    company: "Series B SaaS company",
    voiceId: process.env.ELEVENLABS_VOICE_ID_3 ?? "",
    avatar:  "/personas/james.png",
  },
];

export function getRandomPersona(): Persona {
  return PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
}

export function getPersonaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
