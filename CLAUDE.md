# CLAUDE.md — Hugh Interview Coach

## What is Hugh?
Hugh is an AI-powered mock interview training web app. Users select a domain room (Data Engineering, Data Science, ML Engineering), are assigned a random AI persona, and go through a voice-driven interview loop: the persona asks a question aloud, the user responds by voice, reviews their transcript, submits, and receives spoken feedback. Named after the first person who interviewed the founder.

## Tech Stack
| Layer | Tool |
|---|---|
| Frontend + Backend | Next.js 14 (App Router), deployed on Vercel |
| Database + Auth | Supabase (PostgreSQL + Supabase Auth) |
| LLM | Anthropic Claude API (model per route — see Model Selection below) |
| TTS | ElevenLabs API |
| STT | Web Speech API (browser-native, Chrome/Edge only) |
| Styling | Tailwind CSS |

## Model Selection
Pick the model per route by the job, not a blanket default — input tokens are the
bulk of Claude spend, so cheap routes should use the cheap model:

- **`claude-sonnet-4-6`** ($3/$15 per MTok) — reasoning-heavy generation where
  quality matters: track generation, backlog priority, quiz generation, diary
  fact-check, learn/chat tutoring, learn/summarize, mastery **evaluate** (scoring),
  interview feedback.
- **`claude-haiku-4-5`** ($1/$5 per MTok — 5× cheaper input) — classification and
  short, low-stakes generation: similarity checks, hints, 5-whys refinement
  questions, mastery **open**/**respond** (in-character conversational lines).

When in doubt, default to Sonnet. Only move a route to Haiku after confirming the
output quality holds.

## Environment Variables
All secrets live in `.env.local` (never committed). See `.env.example` for the full list.

- `NEXT_PUBLIC_` prefix → safe for client-side use
- All other keys → server-side only, called exclusively from `/app/api/` routes

```
ANTHROPIC_API_KEY
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID_1
ELEVENLABS_VOICE_ID_2
ELEVENLABS_VOICE_ID_3
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Folder Structure
```
app/                        # Next.js pages and API routes only — no business logic here
  api/
    interview/
      generate-question/
      generate-feedback/
      check-similarity/
      tts/
  (auth)/
    login/
    signup/
  interview/
    [room]/
  page.tsx                  # Room selection landing page
components/
  interview/                # QuestionCard, MicButton, WaveformPlayer,
                            # TranscriptEditor, FeedbackCard, PersonaBar
  landing/                  # RoomCard, Hero
  ui/                       # Button, Modal, Toast (shared primitives)
lib/
  supabase/                 # client.ts (browser), server.ts (API routes)
  elevenlabs/               # tts.ts
  claude/                   # prompts.ts
  speech/                   # recognition.ts
hooks/                      # useInterview, useSpeechRecognition, useAudioPlayer
types/                      # Shared TypeScript interfaces
utils/                      # Pure helpers (e.g. similarity logic)
supabase/
  migrations/               # Numbered SQL migration files
public/
  personas/                 # Persona avatar images
```

## Architecture Rules — Read These First

### 1. Never call external APIs from the client
Anthropic and ElevenLabs are server-side only. All calls go through `/app/api/interview/` routes. The browser never sees these API keys.

### 2. One source of truth for session state
The `useInterview` hook owns the entire interview session state. Components receive state and handlers via props — they do not fetch independently.

### 3. Strict interview state machine
The interview loop follows this exact sequence. Do not skip or shortcut states:
```
IDLE → PLAYING_QUESTION → READY → RECORDING → REVIEWING → SUBMITTING → FEEDBACK → NEXT | BREAK
```
- `PLAYING_QUESTION`: ElevenLabs audio is playing, waveform animates
- `READY`: Audio finished, "Show Best Answer" and "I'm Ready" buttons are visible
- `RECORDING`: Web Speech API is active, live transcript shown
- `REVIEWING`: Recording stopped, transcript in editable textarea
- `SUBMITTING`: Similarity check + feedback generation in progress
- `FEEDBACK`: Feedback audio plays, text shown, waveform animates
- `NEXT | BREAK`: User chooses next question or ends session

### 4. No scroll on any screen
Every screen must fit within the viewport height. Use `h-screen`, flex column layouts, and `min-h-0` on flex children to prevent overflow. If content risks overflowing, reduce padding or font sizes — never add scroll.

### 5. Buttons appear only after audio finishes
On the question screen, "Show Best Answer" and "I'm Ready" only render when state is `READY` (audio playback complete). This is enforced in `useAudioPlayer` via an `onEnded` callback that transitions state.

### 6. TypeScript strict mode — no `any`
All components, hooks, API handlers, and utility functions are fully typed. Use the types defined in `types/index.ts`.

## Supabase Conventions
- Use `lib/supabase/client.ts` in client components (`createBrowserClient`)
- Use `lib/supabase/server.ts` in API routes and server components (`createServerClient`)
- All schema changes go in `supabase/migrations/` as numbered SQL files (e.g. `001_initial_schema.sql`)
- Row Level Security (RLS) must be enabled on all tables

## Persona Configuration
Personas are defined as a static config (not in DB for v1). Three personas, each with:
- `id`, `name`, `role`, `company`, `voiceId` (maps to `ELEVENLABS_VOICE_ID_1/2/3`)
- Randomly assigned per session at start time
- Stored in `session.persona_id` for consistency within a session

## Key Design Decisions
| Decision | Choice | Reason |
|---|---|---|
| Similarity check | LLM-judged (Claude), not string match | Handles paraphrasing correctly |
| Similarity threshold | >90% alignment = "used best answer" | Generous but meaningful |
| Intro questions | Hardcoded pool of 4, pick 1-2 randomly | Consistent quality, always relevant |
| Domain questions | Dynamically generated by Claude per session | Variety, no repetition |
| Break mechanic | Session saved to Supabase with status = 'paused' | Flexible, data not lost |

## DO NOT Build (Deferred to v2)
- Voice analysis: filler word detection, speech pace, volume, confidence scoring
- Performance dashboard and readiness score
- Mobile responsive layout
- Current events integration in questions
- AssemblyAI / Whisper STT upgrade
- Additional interview domains beyond DE, DS, MLE

## DO NOT Do (Ever)
- Call Anthropic or ElevenLabs from client components
- Use `any` TypeScript type
- Add scrollable containers to any interview screen
- Hardcode API keys anywhere in source code
- Skip the state machine transitions in `useInterview`
