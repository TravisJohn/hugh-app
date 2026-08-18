# CLAUDE.md — Hugh

## What is Hugh?
Hugh is an AI-powered **learning platform** for data and analytics. A learner
picks a topic, Hugh generates a track of milestone cards, and the learner works
through them — asking questions, keeping a learning diary, proving mastery out
loud, drilling code, and working business cases. Named after the first person who
interviewed the founder.

It began as a mock-interview trainer. That flow still exists and still works
(`/interview`), but it is now one surface among several rather than the product.
**Treat the learning loop as the product; treat the interview loop as a live
legacy surface.**

### The surfaces
| Route | What it is |
|---|---|
| `/home` | Activity grid — the logged-in landing page |
| `/home/learn` → `/study/[goalId]` | Pick a topic, then the goal's Kanban track |
| `/study/[goalId]/ask` | Ask Hugh — tutor chat, diary, focus timer |
| `/review/[milestoneId]` | Diary-grounded review quiz |
| `/mastery/[milestoneId]` | Prove mastery out loud (scripted, or Realtime voice behind a flag) |
| `/code/start` · `/code/drill` · `/code` | Pattern map, timed fluency drills, free-form Python sandbox |
| `/cases` · `/cases/lab` | The Case Room (judgment cases) · Case Lab (long-form + CSV) |
| `/cloud` | Cloud-services reference with an assistant |
| `/notes` | Screenshot + reasoning workspace with per-image Coach threads |
| `/interview/[room]` | Legacy mock-interview loop (not linked from `/home`) |
| `/admin` | Admin console — users, approvals, usage and cost |

The public landing page (`/`) presents three pillars — **Learn**, **Apply**
(code), **Show** (cases). All three are live; keep that page honest when a
pillar's scope changes.

## Tech Stack
| Layer | Tool |
|---|---|
| Frontend + Backend | Next.js 16 (App Router, Turbopack), React 19, deployed on Vercel |
| Database + Auth + Storage | Supabase (PostgreSQL + Supabase Auth) |
| LLM — Anthropic | Claude API (model per route — see Model Selection below) |
| LLM — OpenAI | Notes Coach (vision), Notes summarise, Realtime mastery voice, admin architecture assistant |
| TTS | ElevenLabs API |
| STT | Web Speech API (browser-native, Chrome/Edge only) |
| In-browser Python | Pyodide (`lib/code/pyodide.worker.ts`) — code drills and sandbox |
| In-browser SQL | DuckDB-WASM (`lib/code/duckdbClient.ts`) |
| Editor | CodeMirror (`@uiw/react-codemirror`) |
| Styling | Tailwind CSS v4 |

Route gating and session refresh live in **`proxy.ts`** — Next 16's rename of
`middleware.ts`. There is no `middleware.ts`; don't add one.

## Model Selection
Pick the model per route by the job, not a blanket default — input tokens are the
bulk of Claude spend, so cheap routes should use the cheap model:

- **`claude-sonnet-4-6`** ($3/$15 per MTok) — reasoning-heavy generation where
  quality matters: track generation, backlog priority, quiz generation, diary
  fact-check, learn/summarize, mastery **evaluate** (scoring), interview
  feedback, document topic extraction.
- **`claude-haiku-4-5`** ($1/$5 per MTok — 5× cheaper input) — classification and
  short, low-stakes generation: similarity checks, hints, 5-whys refinement
  questions, mastery **open**/**respond** (in-character conversational lines),
  learn/chat, cloud/chat, code/chat, the topic-domain gate.
- **OpenAI** — `gpt-4o` where vision is needed (Notes Coach reads screenshots);
  `gpt-4o-mini` where it isn't (Notes summarise).

When in doubt, default to Sonnet. Only move a route to Haiku after confirming the
output quality holds.

### Every route names its model once
A route must declare `const MODEL = "…"` (or bind a local, where the model varies
by phase) and use that **one** binding for both the API call and the usage log.
Never repeat the model string — the two must not be able to drift apart.

## Usage and cost accounting
Every route that spends tokens **must** call `logUsage` with its `model`. A route
that calls `enforceUsageGate` but never logs is a bug: it checks the learner's
budget and then spends against it invisibly.

- Rates live in `lib/pricing.ts` — pure and unit-tested. `lib/usage.ts` re-exports
  them for the existing importers.
- Cost is computed **per log row**, at that row's own model rate, and then summed.
  Never apply one blended rate to an aggregate: Hugh's models differ by up to 20×,
  so aggregate-then-price silently mis-states spend.
- Adding a model means adding it to `MODEL_RATES`. An unknown model falls back to
  the most expensive Claude rate, so unknown spend is over-stated, never hidden,
  and `logUsage` warns in dev.
- Retry loops accumulate tokens across attempts — a discarded attempt still costs
  money and must still be logged.

## Environment Variables
All secrets live in `.env.local` (never committed). See `.env.example` for the
full list with notes on what each one gates.

- `NEXT_PUBLIC_` prefix → safe for client-side use
- All other keys → server-side only: read them from `/app/api/**` route handlers,
  Server Components, or `lib/**` modules marked `import "server-only"`

```
ANTHROPIC_API_KEY               # required
ELEVENLABS_API_KEY              # required
ELEVENLABS_VOICE_ID_1/2/3       # required
NEXT_PUBLIC_SUPABASE_URL        # required, public by design
NEXT_PUBLIC_SUPABASE_ANON_KEY   # required, public by design
SUPABASE_SERVICE_ROLE_KEY       # required, bypasses RLS — never expose
OPENAI_API_KEY                  # optional — gates Notes Coach, Realtime mastery
OPENAI_MODEL                    # optional — admin architecture assistant
HUGH_ADMIN_URL                  # optional — admin architecture assistant
MASTERY_REALTIME_ENABLED        # optional flag — Realtime voice mastery
SUPABASE_ACCESS_TOKEN           # optional — only for scripts/run-migration.ts
```

## Folder Structure
```
app/                        # Pages and API routes only — no business logic here
  api/                      # admin · architecture · auth · cases · cloud · code
                            # dashboard · interview · learn · notes · tracker
  (auth)/                   # login, signup
  home/                     # activity grid + /home/learn topic picker
  study/[goalId]/           # track board, ask page
  review/ · mastery/        # milestone review quiz, prove-mastery
  code/ · cases/ · cloud/ · notes/ · interview/ · tracker/ · admin/
components/                 # one folder per surface, plus ui/ primitives
lib/
  supabase/                 # client.ts (browser), server.ts (routes), service.ts
  claude/                   # prompts and parsers
  pricing.ts                # per-model rates (pure, tested)
  usage.ts                  # logging, quota gates (server-only)
  tracker/ · learn/ · code/ · cases/ · case-lab/ · cloud/ · notes/ ·
  mastery/ · documents/ · askcode/ · pomodoro/ · architecture/
hooks/                      # useInterview, useNotes, usePomodoro, …
types/                      # Shared TypeScript interfaces
utils/                      # Pure helpers
supabase/migrations/        # Numbered SQL migration files
tools/architecture-dashboard/  # Local admin dashboard (built by predev/prebuild)
public/personas/            # Persona avatar images
```

## Architecture Rules — Read These First

### 1. Never call external APIs from the client
Anthropic, OpenAI, and ElevenLabs are server-side only. All calls go through
`/app/api/**` routes. The browser never sees these API keys.

### 2. One source of truth for session state
A screen's hook owns its state; components receive state and handlers via props
and do not fetch independently. `useInterview` owns the interview session;
`useNotes` / `useNotesLayout` own the Notes workspace.

### 3. Strict interview state machine (`/interview` only)
The legacy interview loop follows this exact sequence. Do not skip or shortcut
states:
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
Every screen must fit within the viewport height. Use `h-screen`, flex column
layouts, and `min-h-0` on flex children to prevent overflow. If content risks
overflowing, reduce padding or font sizes — never add scroll.

**Exception — the Notes workspace (`/notes`).** Notes is a document-style tool for
reviewing long screenshots and coaching threads, so its three panes (tree ·
screenshots · thread) each scroll *internally* while the page itself stays locked
to the viewport (`h-screen`, no page scroll). This is the only screen permitted to
scroll inside its panes.

Those panes are also user-resizable and individually collapsible. The geometry
lives in `lib/notes/layout.ts` (pure, unit-tested) and is driven by
`useNotesLayout`; a collapsed pane becomes a clickable rail, never nothing. Pane
components take their width from the workspace wrapper — they must not set their
own widths.

The public landing page (`/`) is marketing, not an app screen, and scrolls
normally.

### 5. Buttons appear only after audio finishes
On the interview question screen, "Show Best Answer" and "I'm Ready" only render
when state is `READY` (audio playback complete). Enforced in `useAudioPlayer` via
an `onEnded` callback that transitions state.

### 6. TypeScript strict mode — no `any`
All components, hooks, API handlers, and utility functions are fully typed. The
codebase currently has zero `any` and zero `@ts-ignore` — keep it that way.

### 7. Pure logic goes in a testable module
Anything with real branching — layout geometry, scoring, parsing, pricing, heat —
belongs in a pure `lib/**` module with unit tests beside it, not inline in a
component or a route that imports `server-only`. See `lib/notes/layout.ts`,
`lib/code/heat.ts`, `lib/pricing.ts`.

## Supabase Conventions
- `lib/supabase/client.ts` in client components (`createBrowserClient`)
- `lib/supabase/server.ts` in API routes and server components (`createServerClient`)
- `lib/supabase/service.ts` for service-role work that must bypass RLS
- All schema changes go in `supabase/migrations/` as numbered SQL files
- Migrations are **forward-only** — there is no rollback tooling. Apply them via
  the Supabase Dashboard SQL editor, or `scripts/run-migration.ts` with
  `SUPABASE_ACCESS_TOKEN` set. Applying is a manual step: shipping code that
  depends on an unapplied migration will break at runtime.
- Row Level Security must be enabled on all tables

## Persona Configuration
Personas are a static config (not in DB), used by the legacy interview loop.
Three personas in `lib/personas.ts`, each with `id`, `name`, `role`, `company`,
`voiceId` (maps to `ELEVENLABS_VOICE_ID_1/2/3`), `avatar`. Randomly assigned per
session and stored in `session.persona_id` for consistency within a session.

## Key Design Decisions
| Decision | Choice | Reason |
|---|---|---|
| Topic scope | Data/analytics only, LLM-judged gate at every entry point | Keeps tracks coherent; broader scope is a separate product |
| Similarity check | LLM-judged (Claude), not string match | Handles paraphrasing correctly |
| Similarity threshold | >90% alignment = "used best answer" | Generous but meaningful |
| Review quizzes | Must quote verified diary lines | A quiz on untaught material is noise |
| Cases | Static JSON, zero runtime AI | Fast, cheap, portable; AI is used to author them offline |
| Cost accounting | Per-row, per-model | Models differ by up to 20×; one blended rate mis-states spend |

## DO NOT Build (deferred)
- Voice analysis: filler words, speech pace, volume, confidence scoring
- Mobile responsive layout
- AssemblyAI / Whisper STT upgrade
- Case grading / sealed answer keys (Case Lab v2)
- Widening the topic gate beyond data/analytics — that's a separate app

## DO NOT Do (ever)
- Call Anthropic, OpenAI, or ElevenLabs from client components
- Use the `any` TypeScript type
- Add scrollable containers to an interview screen
- Hardcode API keys, or a model string in more than one place per route
- Spend tokens without calling `logUsage` with the model
- Skip the state machine transitions in `useInterview`
- Add a `middleware.ts` — this project uses `proxy.ts` (Next 16)
