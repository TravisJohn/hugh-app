import "server-only";

// ── Realtime mastery configuration (single source of truth, server-only) ────
// Imported by the ephemeral-session route to build the coach session. The
// browser never sees the model names or the API key — only the minted secret
// and the coarse caps it needs to enforce client-side.

// Speech-to-speech model that CONDUCTS the mastery conversation.
export const REALTIME_MODEL = "gpt-realtime";

// Explicit transcription model for the learner's speech (never a default) so the
// transcript that feeds the recap is deterministic. Transcription still runs, but
// it is NOT shown live (distracting + it guessed wrong languages) — it's captured
// silently for the end-of-session recap only.
export const REALTIME_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

// Pin the transcription language so it stops guessing (and mis-rendering) other
// languages mid-conversation. One-line change if the app ever goes multilingual.
export const TRANSCRIPTION_LANGUAGE = "en";

// ── Turn detection (noise robustness) ───────────────────────────────────────
// server_vad tuned to be LESS jumpy than the defaults, because the reflection is
// held in ordinary rooms with background noise:
//   • threshold 0.75 (default 0.5) — needs clear, deliberate speech to trigger,
//     so ambient noise doesn't register as the learner talking. This high
//     threshold is what keeps barge-in from firing on stray sounds.
//   • silence_duration_ms 900 (default ~500) — waits ~0.9 s of silence before
//     ending a turn, so a thinking pause isn't cut off (fixes "I feel rushed").
//   • interrupt_response true — the learner CAN talk over the coach and it stops
//     to listen (the natural, conversational feel). The high threshold is the
//     guard that stops background noise from doing this accidentally.
export const TURN_DETECTION = {
  type:                "server_vad" as const,
  threshold:           0.75,
  prefix_padding_ms:   300,
  silence_duration_ms: 900,
  create_response:     true,
  interrupt_response:  true,
};

// A single calm, coach-like built-in Realtime voice. (Persona randomisation was
// an ElevenLabs-era concern; the mastery coach is one consistent voice.)
export const MASTERY_VOICE = "cedar";

// ── Hard caps (app-owned lifecycle) ─────────────────────────────────────────
// Phase 30 (Guided Reflection) is UNMARKED and learner-ended — the coach never
// concludes on its own. These caps are pure cost/safety backstops so a forgotten
// session can't run unbounded; they're deliberately generous so a genuine
// reflection is never cut off mid-thought.
export const MAX_SESSION_SECONDS = 15 * 60;  // absolute session lifetime
export const MAX_FOLLOWUPS       = 24;       // coach turns before the backstop trips
export const INACTIVITY_MS       = 120_000;  // silence window before auto-ending

// Diary context is supporting learner colour only — capped so it can never
// dominate the authoritative card criteria in the prompt.
export const MAX_DIARY_CHARS = 2_500;
