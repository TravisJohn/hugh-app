# Hugh — Project Log

## Phase 1 — Foundation ✅
- Installed all dependencies (Supabase SSR, ElevenLabs, Anthropic, server-only, etc.)
- Created `lib/supabase/client.ts` and `lib/supabase/server.ts`
- Created `lib/supabase/auth-helper.ts` with dev-bypass for API testing
- Created `supabase/migrations/001_initial_schema.sql` (run manually in Supabase Dashboard)
- Renamed `middleware.ts` → `proxy.ts` per Next.js 16 convention
- Created login/signup pages and root layout

## Phase 2 — Types, Personas, Room Selection ✅
- `types/index.ts` — InterviewState, Room, Persona, Session, Question, Answer
- `lib/personas.ts` — server-only persona config (Marcus, Sarah, James)
- `app/page.tsx` — room selection landing page
- `app/interview/[room]/page.tsx` — interview room shell (Server Component)
- `components/interview/PersonaBar.tsx` and `BreakButton.tsx`
- `app/actions/session.ts` — `createSession` and `pauseSession` Server Actions

## Phase 3a — API Routes ✅
All routes under `app/api/interview/`:
- `generate-question/` — intro (hardcoded pool) + domain (Claude-generated)
- `tts/` — ElevenLabs via `personaId` lookup (voiceId stays server-only)
- `check-similarity/` — Claude-judged alignment, threshold ≥ 90%
- `generate-feedback/` — context-aware 2–3 sentence feedback via Claude
All 5 integration tests passing (`scripts/test-api.ts`).

## Phase 3b — Hooks ✅
- `hooks/useAudioPlayer.ts` — fetch TTS audio, Web Audio API, AnalyserNode waveform data via ref (no 60fps re-renders), play-ID counter prevents stale onEnded fires after manual stop
- `hooks/useSpeechRecognition.ts` — Web Speech API wrapper, continuous mode with auto-restart on silence, interim + final transcript merging
- `hooks/useInterview.ts` — full state machine (IDLE → PLAYING_QUESTION → READY → RECORDING → REVIEWING → SUBMITTING → FEEDBACK → BREAK), stateRef mirrors state to avoid stale closures in callbacks
- `types/speech.d.ts` — manual Web Speech API type declarations (SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent) absent from TypeScript DOM lib
- `types/index.ts` extended with `ClientPersona` (Omit<Persona, 'voiceId'>) for safe client-side persona passing
Zero TypeScript errors confirmed (`npx tsc --noEmit`).

**Missed from log — Coaching modes** (built in Phase 3b, not logged at the time):
- `CoachingMode` type (`'active' | 'passive'`) added to `types/index.ts`
- **Active mode** — full feedback loop after each answer: similarity check → feedback generation → `FEEDBACK` state → TTS playback → Next/Break buttons
- **Passive mode** — silent path: similarity check and feedback are generated and persisted to Supabase but never surfaced to the user; hook skips `FEEDBACK` state entirely and jumps straight to the next `PLAYING_QUESTION`; session is auto-completed via `completeSession()` if ≥ 5 answers given, otherwise `pauseSessionWithNotice()`
- `coachingModeRef` (not state) holds the mode inside `useInterview` so the async `submitAnswer` callback always reads the current value without stale-closure issues
- `InterviewRoom` receives `coachingMode` as a prop from the Server Component page; `PersonaBar` displays a badge indicating the active mode

## Key Design Decisions
| Decision | Choice | Reason |
|---|---|---|
| `waveformDataRef` not state | `MutableRefObject<Uint8Array>` | 60fps state updates cause entire InterviewRoom to re-render; WaveformPlayer reads the ref in its own RAF loop |
| Play ID counter | `useRef<number>` | Prevents `onended` of a stopped source from calling `onEnded()` after a new play starts |
| `stateRef` alongside `state` | `useRef` mirrors `useState` | Callbacks with empty dep arrays see current state without stale closure bugs |
| `ClientPersona` type | `Omit<Persona, 'voiceId'>` | ElevenLabs voice IDs are resolved server-side via `personaId`; never sent to client |
| Model | `claude-sonnet-4-6` | `claude-sonnet-4-20250514` returned 404; corrected after health check |

## Phase 4 — Interview Room UI ✅
**8 new components + InterviewRoom orchestrator wired to useInterview:**

- `WaveformPlayer` — canvas RAF loop reading waveformDataRef, 48 bars, #38BDF8, ResizeObserver for responsive width, DPR-aware rendering
- `QuestionCard` — Lora serif italic, large/small size with CSS transitions, curly quotes
- `BestAnswerPanel` — "Suggested Approach" label, max-h-36 internal scroll for long answers
- `MicButton` — 96px circular sky-400 button, animate-ping glow ring, mic SVG icon
- `LiveTranscript` — real-time transcript with auto-scroll, pulsing red recording badge
- `TranscriptEditor` — auto-resize textarea (max 288px), Submit Answer + Re-record actions
- `FeedbackCard` — WaveformPlayer while playing, first-sentence bold, Next/Break buttons appear after isPlaying=false
- `InterviewRoom` — Client Component orchestrator, Strict Mode guard on startSession, state-driven content switching

**Other changes:**
- `PersonaBar` — updated to ClientPersona (no voiceId), live questionIndex prop
- `app/interview/[room]/page.tsx` — constructs ClientPersona (strips voiceId), renders InterviewRoom
- `hooks/useInterview.ts` — added reRecord() handler (REVIEWING → READY)
- `app/layout.tsx` + `globals.css` — added Lora serif font via next/font/google, --font-serif CSS var
- `types/speech.d.ts` — Web Speech API types (SpeechRecognition, events, errors)
- `types/index.ts` — ClientPersona = Omit<Persona, 'voiceId'>

**Verification:** TypeScript zero errors, HTTP 200 on /login, HTTP 307 (compile OK) on all 3 interview rooms

## Phase 5 — UX Cohesion (PRD-v3) ✅

**Three-zone layout implemented across all interview states:**

- `components/interview/QuestionZone.tsx` (new) — question text anchored here, font size transitions smoothly with `transition-all duration-300` (large in PLAYING/READY, small otherwise), never remounts
- `components/interview/ActionZone.tsx` (new) — fixed `h-28` bottom strip, all buttons live here exclusively
- `components/interview/SubmittingState.tsx` (new) — two `animate-pulse` skeleton bars + caption, replaces faint text
- `components/interview/InterviewRoom.tsx` — full restructure: `max-w-3xl mx-auto` wrapper, `key={state}` on content zone for `animate-fadeIn`, all buttons moved out of content zone into ActionZone
- `components/interview/FeedbackCard.tsx` — buttons removed (now in ActionZone), clean waveform + text display only
- `components/interview/TranscriptEditor.tsx` — buttons removed, `onChange` prop added; InterviewRoom mirrors `reviewText` state to pass to `submitAnswer`
- `app/globals.css` — `@keyframes fadeIn` + `.animate-fadeIn` class added
- `lib/claude/prompts.ts` — `introQuestionBestAnswerPrompt` now generates instructional prose (structure/approach guidance) instead of `[Job Title]` placeholder templates
- Recording indicator: pulsing red dot (`animate-ping`) + "Recording…" text
- WaveformPlayer: already 80px in both PLAYING_QUESTION and FEEDBACK — no change needed

**Verification:** Zero TypeScript errors, clean production build, all 11 routes compiled.

## Phase 6 — Bug Fixes (Live Testing) ✅

Six bugs identified from live testing, all resolved:

| # | Bug | Fix |
|---|-----|-----|
| 1 | RECORDING state showed both a standalone "Recording…" indicator (content zone) and "Stop Recording" button (ActionZone) simultaneously | Replaced inline indicator with `<LiveTranscript>` component — live transcript now fills the content zone; ActionZone Stop button is the sole recording control |
| 2 | Claude API feedback returned `**bold**` raw markdown asterisks | Added `renderBold()` in `FeedbackCard.tsx` — splits on `**...**` regex and wraps matches in `<strong>` tags; no new dependencies |
| 3–5 | Long questions pushed IdealAnswerPanel off-screen; IdealAnswerPanel overlapped ActionZone mic button; page-level and panel-level scrollbars both visible | `QuestionZone`: added `max-h-[35vh] overflow-y-auto` cap. Middle wrapper and content zone wrapper: added `overflow-hidden`. READY/RECORDING/REVIEWING/PLAYING/IDLE/BREAK content divs: added `min-h-0` for correct flex shrink. ActionZone stays anchored at bottom; page itself never scrolls |
| 6 | Default browser scrollbar visible on dark backgrounds | Added global `*` custom scrollbar CSS in `globals.css`: 6px width, transparent track, `#334155` thumb, `#475569` hover thumb, using both `::-webkit-scrollbar` (Webkit) and `scrollbar-width/color` (Firefox) |

Zero TypeScript errors confirmed post-fix.

---

## Phase 7 — Session Setup (Custom Topics, Job Ad, Skip Intro) ✅

Replaced the three-card room selector with a unified session setup form. Three features shipped together as they share the same entry point.

### Feature 1 — Custom topic selection
- `types/index.ts` — added `PresetRoom = 'data_engineering' | 'data_science' | 'ml_engineering'`, `Room = PresetRoom | 'custom'`, `isPresetRoom()` guard
- `supabase/migrations/003_session_setup_fields.sql` — widened `sessions_room_check` constraint to include `'custom'`; added `topic TEXT`, `job_description TEXT`, `skip_intro BOOLEAN DEFAULT false` columns
- `components/landing/SessionSetupForm.tsx` (new) — three preset chips + free-text input; clicking a chip pre-fills the field; editing the field deselects all chips; room slug is `selectedRoom ?? 'custom'`; topic text only stored for custom sessions (presets fall back to `ROOM_CONTEXT` server-side)
- `lib/claude/prompts.ts` — `ROOM_CONTEXT` typed as `Record<PresetRoom, string>` and exported; `questionGenerationPrompt` signature changed to `(topicContext: string, previousQuestions: string[], jobDescription?: string)`
- `app/api/interview/generate-question/route.ts` — computes `topicContext = isPresetRoom(room) ? ROOM_CONTEXT[room] : topic`; accepts `topic?` and `jobDescription?` in request body

### Feature 2 — Job ad input
- `SessionSetupForm` — collapsible "Paste a job description (optional)" section; textarea expands on toggle; job ad trimmed before sending
- `app/actions/session.ts` — `createSession` accepts `jobDescription?`; stored as `job_description` on session
- `generate-question` route — `jobDescription` passed to `questionGenerationPrompt` as third arg; appended to Claude prompt: tailors question to specific stack, seniority, responsibilities (capped at 1 500 chars to limit token use)
- `app/api/interview/generate-hint/route.ts` — same `topicContext` resolution pattern for `hintGenerationPrompt`; `hintGenerationPrompt` updated to accept `topicContext: string` directly

### Feature 3 — Skip intro toggle
- `SessionSetupForm` — pill toggle switch (off by default); "Jump straight to domain questions" sub-label
- `app/actions/session.ts` — `skipIntro?` stored as `skip_intro` on session
- `hooks/useInterview.ts` — `startSession` accepts `topic?`, `jobDescription?`, `skipIntro?`; `topicRef` + `jobDescriptionRef` added (same stale-closure pattern as `coachingModeRef`); when `skipIntro = true`, first question is `questionType = 'domain'`, `questionIndex = 2` — no state machine changes, existing transitions unchanged; all `apiFetchQuestion` calls thread `topic` and `jobDescription` from refs

### Other changes
- `app/page.tsx` — imports `SessionSetupForm` (replaces `RoomGrid`)
- `app/interview/[room]/page.tsx` — reads `topic`, `job_description`, `skip_intro` from session; passes to `InterviewRoom`
- `components/interview/InterviewRoom.tsx` — `topic?`, `jobDescription?`, `skipIntro?` props; passed to `startSession` and `PersonaBar`
- `components/interview/PersonaBar.tsx` — `topic?` prop; `ROOM_LABELS` gains `custom: 'Custom'` key; custom sessions display their topic text instead of "Custom"
- `components/interview/SessionSummary.tsx` — same `ROOM_LABELS` fix + `topic?` prop for summary header
- `lib/claude/prompts.ts` — `sessionAssessmentPrompt` uses `isPresetRoom` guard and accepts optional `topic?`; `hintGenerationPrompt` accepts `topicContext: string`

**Verification:** Zero TypeScript errors confirmed (`npx tsc --noEmit`).

---

## Phase 8 — Landing Page UI Fixes ✅

Five visual fixes on the session setup page; interview room layout untouched.

| # | Fix | Change |
|---|-----|--------|
| 1 | Toggle knob overlapping "S" in "Skip intro question" | `gap-3 → gap-4` between toggle and label text; added `shrink-0` to button so it can't compress; sub-label indent updated from `pl-14` to `pl-[60px]` (`44px button + 16px gap`) |
| 2 | No breathing room between headline and Topic section | Main `gap-8 → gap-10` (32px → 40px) between h1 and form |
| 3 | CTA button cut off on laptop screens | Outer wrapper `h-screen overflow-hidden → min-h-screen` (no overflow clip); main drops `min-h-0`, gains `py-10` padding; page scrolls naturally when content exceeds viewport |
| 4 | No user avatar in header | Added 32px circular `bg-slate-700` avatar left of email showing uppercased first character of the email local-part |
| 5 | Plain "Hugh" text in nav | `import Image from "next/image"`; replaced text span with `<Image src="/hugh-logo.png" height={32} width={120} className="h-8 w-auto" priority />` |

Files changed: `app/page.tsx`, `components/landing/SessionSetupForm.tsx`.  
Zero TypeScript errors confirmed.

---

## Phase 9 — JD-only Session Validation ✅

Allow sessions to start with a job description alone — no explicit topic required.

**Validation change (`SessionSetupForm.tsx`):**
- `canSubmit` now passes when any of: preset room selected, topic text present, or job ad present
- Previous rule required topic or preset; new rule: topic **OR** job description **OR** preset

**Prompt change (`lib/claude/prompts.ts`):**
- `questionGenerationPrompt` signature changed from `topicContext: string` → `topicContext: string | null`
- When `null`, the role intro becomes: *"You are a senior interviewer. Infer the interview domain, required stack, and seniority level entirely from the job description below."* — Claude derives domain context from the JD rather than a named topic

**Route change (`app/api/interview/generate-question/route.ts`):**
- `topicContext` resolution: custom room + no topic + JD present → `null` (triggers JD-infer path)
- custom room + no topic + no JD → `"general data and ML engineering"` (unchanged fallback)
- Preset rooms always use `ROOM_CONTEXT[room]` regardless of JD (unchanged)

Zero TypeScript errors confirmed.

---

## Phase 10 — Interviewer Audio Toggle ✅

Allow users to disable ElevenLabs TTS so questions and feedback are text-only. Microphone and Web Speech API remain active regardless of this setting.

### What the toggle controls
**On**: interviewer speaks questions and feedback aloud via ElevenLabs TTS (unchanged behaviour).  
**Off**: TTS skipped entirely; question text is shown immediately, feedback text is shown immediately. Mic and speech recognition are unaffected — recording flow is identical in both modes.

### Setup page (`components/landing/SessionSetupForm.tsx`)
- Added `voiceEnabled` state (default `true`)
- "Interviewer audio" toggle added below skip intro toggle; sub-label "Questions and feedback spoken aloud"; inline note "Adds 1–3s per question for audio generation" shown when ON
- `voiceEnabled` passed as 6th argument to `createSession`

### DB (`supabase/migrations/004_voice_enabled.sql`)
- `voice_enabled BOOLEAN NOT NULL DEFAULT true` added to `sessions` — existing sessions keep voice ON

### Types (`types/index.ts`)
- `voice_enabled: boolean` added to `Session` interface

### Server Action (`app/actions/session.ts`)
- `voiceEnabled?` parameter added, stored as `voice_enabled` in DB

### Interview page (`app/interview/[room]/page.tsx`)
- Reads `voice_enabled` from session (defaults `true` if null), passes as `voiceEnabled` prop to `InterviewRoom`

### Hook (`hooks/useInterview.ts`)
- `voiceEnabledRef = useRef(true)` — same stale-closure pattern as `coachingModeRef`
- `startSession` accepts `voiceEnabled?`, sets ref on session start
- When `voiceEnabledRef.current === false`:
  - `startSession`: skips `play()`, transitions directly `→ READY`
  - `submitAnswer` passive path: skips `play()`, transitions `→ READY`
  - `submitAnswer` active path: skips `play()`, enters `FEEDBACK` with `isPlaying=false` (buttons appear immediately)
  - `nextQuestion`: skips `play()`, transitions directly `→ READY`
- RECORDING state and `submitAnswer` guard are unchanged — mic is always the input

### Interview room (`components/interview/InterviewRoom.tsx`)
- `voiceEnabled?` prop added; `isVoice = voiceEnabled ?? true` used throughout
- `PLAYING_QUESTION` content: waveform (voice on) or "Loading question…" pulse (voice off); state is skipped entirely in the hook when voice off so this is a fallback only
- `FEEDBACK` content: FeedbackCard with waveform (voice on) or plain text-only div (voice off)
- `FEEDBACK` ActionZone: unchanged — `isPlaying=false` from the start when voice off, buttons appear immediately
- `RECORDING` content and ActionZone: identical in both modes (MicButton, LiveTranscript, Stop Recording)

Zero TypeScript errors confirmed.

---

## Phase 11 — Public Landing Page + Route Split ✅

Separated the public marketing page from the authenticated session setup page.

### Route changes
| Route | Before | After |
|---|---|---|
| `/` | Session setup form (required auth redirect) | Public marketing landing page |
| `/home` | Did not exist | Session setup form (requires auth) |

### New files
- `app/home/page.tsx` — authenticated session setup page moved here; redirects unauthenticated users to `/login`
- `app/page.tsx` — replaced entirely with public marketing landing page (Server Component); redirects authenticated users to `/home`

### Redirects updated
- `app/actions/session.ts` — `pauseSession` and `pauseSessionWithNotice` redirect to `/home` and `/home?notice=min5`
- `app/(auth)/login/page.tsx` — post-login redirect: `/` → `/home`
- `app/(auth)/signup/page.tsx` — email confirmation redirect and post-signup redirect: `/` → `/home`
- `app/interview/[room]/page.tsx` — guard redirects: `/` → `/home`

### Landing page sections
- **Nav**: amber GraduationCap icon + "Hugh" serif + "skill prep app" pill + Sign in link
- **Hero**: 88px amber avatar, serif headline, subtext, primary ("Start practicing free") + secondary ("Sign in") buttons, attribution line
- **The Platform**: 3 cards — Interview prep (sky border, Live badge), Progress tracker (SOON, opacity-60), Focused learning (SOON, opacity-60)
- **How It Works**: 4 steps in `grid-cols-2 md:grid-cols-4`; Step 1 has `border-t-2 border-sky-500`, rest have `border-t border-slate-700`
- **Bottom CTA**: serif "Ready to face it?", "Enter a room" button, footer text

Icons: `GraduationCap`, `Mic`, `TrendingUp`, `Lightbulb` (lucide-react).  
Zero TypeScript errors confirmed (`npx tsc --noEmit`).

---

## Phase 6 — Deploy

### Environment Variables (Vercel)
Add each of these in Vercel → Project Settings → Environment Variables:

**Anthropic**
- [ ] `ANTHROPIC_API_KEY`

**ElevenLabs**
- [ ] `ELEVENLABS_API_KEY`
- [ ] `ELEVENLABS_VOICE_ID_1` (Marcus)
- [ ] `ELEVENLABS_VOICE_ID_2` (Sarah)
- [ ] `ELEVENLABS_VOICE_ID_3` (James)

**Supabase**
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

### Supabase Production
Run both migrations in the Supabase Dashboard → SQL Editor (in order):
- [ ] `supabase/migrations/001_initial_schema.sql` — creates `sessions`, `questions`, `answers` tables + RLS policies
- [ ] `supabase/migrations/002_phase2_schema.sql` — adds `coaching_mode` to `sessions`, `hint` to `questions`
- [ ] Confirm RLS is enabled on all three tables in the Supabase Table Editor

### API Route Hardening
Gaps found in source — address before public launch:
- [ ] No rate limiting on any of the 6 API routes (`generate-question`, `tts`, `check-similarity`, `generate-feedback`, `generate-hint`, `generate-session-assessment`) — add Vercel's built-in rate limiting or an edge middleware solution
- [x] `tts` route: `text` field capped at 2 000 characters — returns 400 if exceeded (guards ElevenLabs cost)
- [ ] `check-similarity` and `generate-feedback` routes: `transcript` field has no length cap — large transcripts inflate Claude token usage; add a max length guard
- [ ] `next.config.ts` is empty — add security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) via the `headers()` export

### Smoke Tests
Run these manually after deploying to Vercel production:
- [ ] Auth flow: sign up with a new email → confirm email → log in → land on room selection page → sign out
- [ ] Full interview loop: select a room → confirm persona assigned and question plays via TTS → record a spoken answer → review and submit transcript → receive spoken feedback → click Next Question → session saves correctly on Take a Break

---

## Phase 12 — Product Pivot: Hugh Learning Platform ✅

Product direction changed from interview coaching to an AI-powered learning platform. Interview features kept but decommissioned from the main navigation. New core loop: user sets a learning goal → refinement Q&A → auto-generated Kanban track → Ask Hugh chat → session diary.

### Product areas built

**Dashboard (`/home`)**
- Refinement Q&A flow ("5 whys" / onion method) — up to 5 Claude-generated questions to deepen a stated goal; in-place state machine (`idle → refining → waiting → done`), no page transitions
- Waiting state: animated brain + 4 cycling stage labels + rotating expert tips (topic-specific, from Claude)
- Goal saved with AI-refined topic name (`refineTopicPrompt`); "Let's Discuss" button triggers the flow
- `app/api/dashboard/refine/route.ts` — POST `{ topic, answers[] }` → `{ question, done }`
- `app/api/dashboard/goals/route.ts` — accepts `answers[]`, calls Claude for refined topic + tips, inserts goal, auto-generates linked track

**Tracker (`/tracker`, `/tracker/[trackId]`)**
- Kanban board: Backlog → Learn → Review → Done columns, drag-and-drop via `@dnd-kit/core`
- Milestone cards with diary entry count badge; drag updates column in DB via PATCH
- `MilestoneDrawer` — slides in on card click: summary, "Ask Hugh →" CTA, full learning diary (entries with title + timestamp)
- `lib/tracker/generate.ts` — shared `generateTrack()` helper called by both manual creation and goal finalization
- `supabase/migrations/009_track_goal_link.sql` — added `goal_id FK` on `tracks` linking goals to their auto-generated track

**Study sub-pages (`/study/[goalId]`)**
- Goal landing: three cards — Track (green, "Start here" badge), Ask (violet), Converse (locked, "Hugh needs more learning data")
- Shared `StudyTabs` component for tab navigation (URL-based active state)
- `/study/[goalId]/track` — queries track by `goal_id`, shows Kanban directly (no landing page)
- `/study/[goalId]/ask` — full ChatWindow with summarise and milestone focus strip (`?milestoneId=&milestone=`)

**Ask Hugh chat (`/learn`, `/api/learn/chat`, `/api/learn/summarize`, `/api/learn/save-summary`)**
- `focusedLearningSystemPrompt` — JSON-structured response `{ reply, isOffTopic }`, off-topic replies redirect politely
- `ChatBubble` — markdown rendering via `react-markdown` + `remark-gfm`
- Off-track notice banner with dismiss
- Summarise session: side panel with narrative story (3–4 sentences) + highlighted key takeaway

**Landing page (`/`)**
- `FeatureCards` client component: Track (green), Ask (violet), Converse (locked/sky) — clicking reveals Sign in / Create account buttons inline
- Converse: "coming soon" inline notice; no auth buttons shown

### Key technical decisions
| Decision | Choice | Reason |
|---|---|---|
| Synthetic welcome stripped from API calls | Filter index-0 assistant message before sending to Claude | Prevents format drift — Claude sees a non-JSON assistant turn and stops honouring the JSON system prompt on longer threads |
| Auto-generate track during goal finalization | `generateTrack()` called inside the goals POST while user sees waiting state | No separate action needed; track is ready when user first opens Study page |
| `milestoneId` in Ask Hugh URL | `?milestoneId=id&milestone=title` | ID is needed for the save-summary API; title is for the display focus strip |
| Session summary format | Narrative story + single takeaway (not bullet lists) | More useful as a diary record; the story is saveable as a readable learning entry |

### Migrations required (run in order)
- `009_track_goal_link.sql` — `goal_id` FK on `tracks`
- `010_milestone_entry_title.sql` — `title TEXT` column on `milestone_entries`

Zero TypeScript errors confirmed after each milestone.

---

## Phase 13 — UX Polish Pass ✅

Fixes and improvements from live testing:

| Item | Change |
|---|---|
| Chat errors on 4th+ message | Stripped synthetic welcome from API payload in `ChatWindow`; added plain-text fallback in `/api/learn/chat` when Claude drifts from JSON format |
| Raw `**markdown**` in chat bubbles | `ChatBubble` now uses `react-markdown` + `remark-gfm` |
| Ask Hugh drawer cramped + raw markdown | Removed inline chat tab entirely; replaced with a violet "Ask Hugh about this →" card navigating to the full Ask page |
| Milestone context lost in Ask page | URL carries `?milestoneId=` (for save API) and `?milestone=` (for focus strip display); focus strip shows a "Clear focus ×" link |
| Save to Tracker had no navigation | After save, `SummaryPanel` navigates to `/study/[goalId]/track?pulse=[milestoneId]` after 800ms |
| No visual feedback on saved card | `KanbanBoard` accepts `pulseId`; matching card glows violet (bright border + shadow) for 5 seconds then fades via `useEffect` timeout |
| Diary entries lacked identity | `milestone_entries.title` column added; Ask Hugh sessions auto-titled "Ask Hugh — DD Mon YYYY, HH:MM"; title shown in violet above timestamp in drawer |
| Sign-up page "Hugh" missing period | Fixed to "Hugh." in both the form header and confirmation screen |
| Card reorder on Study landing | Track (highlighted, "Start here") → Ask → Converse (locked) |
| Landing page cards outdated | Updated to Track / Ask / Converse naming with click-to-reveal auth buttons |
| Active Kanban card glow | `isActive` state applies `ring-1 ring-violet-500/30 shadow-[0_0_18px_...]` border; `isPulsing` (post-save) applies brighter `ring-2 ring-violet-400/40` glow |

Zero TypeScript errors confirmed.

---

> **Log gap note:** Phases for the admin system, user approval/usage gate, premium gate, milestone review (quiz) and milestone mastery (voice) shipped between Phase 13 and Phase 14 but were not logged at the time. They live in the code (migrations `011`–`014`, `/admin`, `/review`, `/mastery`, `/upgrade`, `/pending`, `/blocked`).

## Phase 14 — Tracker Refinements (fact-check, edit, focus, coverage) ✅

Five refinements to the learning tracker. Two new concepts unify them: a per-milestone
**learning-points checklist** ("things to understand") and a per-track **persistent focus**.

### Decisions (agreed with Travis up front)
- Fact-check runs **automatically** on every entry save/edit; warning lingers until corrected.
- The understanding-**gap footnote is permanent** — kept even after the entry is corrected.
- The **focused milestone is remembered per track** (survives reload/navigation) — unifies the glow and the Ask goal.
- The activity check is **goal-grounded**: the milestone goal is broken into an enumerated checklist, and coverage is judged against it.
- Ask checklist cadence: recompute **on open + Refresh + Summarise** (not keystroke-live).

### Migrations
- `015_entry_factcheck.sql` — `milestone_entries`: `fact_status` (`pending`/`correct`/`incorrect`, with CHECK), `correction`, `gap_note`, `corrected`.
- `016_milestone_focus.sql` — `milestones`: `learning_points JSONB`, `coverage JSONB`; `tracks`: `focus_milestone_id UUID` FK.
- Patched `014_admin_system.sql` to `DROP POLICY IF EXISTS` before `CREATE POLICY` (idempotent re-runs). **Not re-run** — file-only per Travis.

### Types
- `Track.focus_milestone_id`; new `LearningPoint`, `MilestoneCoverage`; `Milestone.learning_points`/`coverage`; `FactStatus`; `MilestoneEntry.{fact_status,correction,gap_note,corrected}`.

### Prompts (`lib/claude/prompts.ts`)
- `factCheckEntryPrompt` — flags only genuine factual/conceptual errors (not reflections); returns `{status, correction, gap}`.
- `learningPointsPrompt` — 4–6 checkable "things to understand" from a milestone goal (generated lazily per card).
- `coveragePrompt` — judges which points the diary + chat meaningfully cover.

### API routes
- `POST /api/tracker/entries/[entryId]/verify` — auto fact-check; on `incorrect` persists correction + permanent gap and leaves the warning; on `correct` clears the warning but keeps the gap. Soft-fails (skips) if usage blocked.
- `PATCH /api/tracker/entries/[entryId]` — edit body/title (→ resets to `pending` for re-verify) or `action:"accept"` to apply the fix.
- `GET/POST /api/tracker/milestones/[id]/coverage` — GET ensures the checklist (one-time gen) + returns cached coverage; POST recomputes coverage from diary (+ optional `chatText`) and caches it.
- `PATCH /api/tracker/tracks/[trackId]` — set `focus_milestone_id`.
- All Claude calls wrapped with `logUsage` (`tracker/verify|points|coverage`).

### Components
- **MilestoneDrawer** — entry editing; clickable fact-check warning with **Accept fix** / **Rewrite myself**; permanent "Gap noted" footnote; new **"What to understand"** section with coverage ticks, `X of N covered` readiness, and a Re-check button. New entries auto-verify in the background; status icons (spinner/⚠/✓) per entry.
- **MilestoneCard / KanbanColumn / KanbanBoard** — new persistent `isFocused` glow sourced from `track.focus_milestone_id`; opening a card sets focus (PATCH track) and it stays glowing until another card is opened. Post-save `pulse` flash retained on top.
- **ChatWindow** — optional `onTranscriptChange` / `onSummariseStart` callbacks (non-breaking).
- **AskWorkspace** (new) — wraps ChatWindow + ChecklistRail, shares the transcript via a ref, triggers a rail recompute on Summarise.
- **ChecklistRail** (new) — persistent right-hand side-rail on Ask: enumerated checklist + live ticks; recomputes on open / Refresh / Summarise.
- **Ask page** — back arrow now goes to `/study/[goalId]/track`; focused milestone resolved from URL param **or** the track's persistent focus, so the goal stays in view.

**Pending deploy step:** run `015` and `016` in the Supabase SQL editor before this ships.

Zero TypeScript errors confirmed (`npx tsc --noEmit`, exit 0).

### Phase 14.1 — Embed ambiguity fix (live-testing bug)
The Ask checklist showed "unavailable". Root cause: `016`'s new `tracks.focus_milestone_id → milestones` FK created a **second** relationship between `milestones` and `tracks`, so PostgREST could no longer resolve `tracks!inner(...)` embeds — they errored with *"more than one relationship was found"*. This silently broke five routes (coverage + verify, plus the pre-existing **milestones PATCH**, **mastery session**, and **review quiz** ownership checks). Fixed by disambiguating with the FK-column hint: `tracks!track_id!inner(...)` in all five. `learning_points` was correctly null (lazy-gen) — the lazy-gen just never ran because the ownership query 404'd first. Verified against the live DB via service-role query.

### Phase 14.2 — Embed ambiguity, round 2 (the `.tsx` + reverse-direction misses)
The 14.1 grep was scoped to `**/*.ts`, so it missed **page** components (`.tsx`) and reverse-direction embeds. Three more spots had the same `016` ambiguity:
- `app/review/[milestoneId]/page.tsx` and `app/mastery/[milestoneId]/page.tsx` — `tracks!inner(user_id)`; the failing query made `milestone` null → `notFound()`/redirect, surfacing as a **genuine 404 page** when opening a review quiz or mastery session. Fixed with `tracks!track_id!inner(...)`.
- `app/tracker/page.tsx` — the **reverse** embed `tracks` → `milestones(...)` (the dashboard's milestone counts) was also ambiguous. Fixed with `milestones!track_id(...)`.
Swept every file extension afterwards; no embeds remain unqualified. Verified the original 404'd milestone ID now resolves. `tsc` exit 0.

---

## Phase 15 — Backlog Priority ✅

A study-order guide for the Backlog column so a novice knows what to tackle next.

### Decisions (clarified with Travis)
- Priority **is** the build-time curriculum order Hugh already generates (fundamentals → advanced, stored as `position`). **No AI call, no re-ranking** — the ranks are fixed at track creation and never change; they're the learner's guide.
- Per-track **Auto | Manual** toggle (default Auto). Auto shows the fixed ranks; Manual lets the learner reorder.
- Manual mechanic: **up/down arrows**, not drag — an agentic call to avoid destabilising the working cross-column DnD right before a push (no `@dnd-kit/sortable`, no board refactor). Drag-sort noted as a clean fast-follow.

### Migration
- `017_backlog_priority.sql` — `tracks.backlog_priority_mode TEXT NOT NULL DEFAULT 'auto'` + CHECK (`auto`|`manual`). **Must be run before this ships.** Degrades gracefully to `auto` if unapplied (column read as undefined → default).

### Types / API
- `Track.backlog_priority_mode`; `BacklogPriorityMode` type.
- `PATCH /api/tracker/tracks/[trackId]` extended to accept `backlogPriorityMode`.
- `PATCH /api/tracker/tracks/[trackId]/reorder` — persists a manual backlog order by reassigning the *existing set* of `position` values to the new order (keeps cards interleaved correctly vs. other columns; no global renumber).

### Components
- **MilestoneCard** — sky `#n` rank badge (backlog only); up/down arrows in Manual mode with `stopPropagation` so they don't trigger drag/drawer.
- **KanbanColumn** — compact Auto|Manual segmented toggle in the Backlog header; passes rank + move handlers to cards.
- **KanbanBoard** — `priorityMode` state, `toggleMode` (persists), `moveCard` (optimistic position swap + reorder PATCH with revert); `byColumn` now sorts by `position` so reorders render.
- Both track pages pass `backlogPriorityMode`.

Zero TypeScript errors (`npx tsc --noEmit`, exit 0).

### Phase 15.1 — Agentic backlog priority (replaces deterministic order)
The Phase 15 rank was just the build-order `position`. Replaced with a **one-time agentic ranking** computed at generation.

- **Migration `018_priority_rank.sql`** — `milestones.priority_rank INTEGER`, `priority_reason TEXT`. **Run before shipping.**
- `backlogPriorityPrompt` + `lib/tracker/priority.ts` `assignBacklogPriority(supabase, trackId, topic)` — one Claude call reasons through the backlog's dependencies and returns a build order; writes each card's rank + a one-line reason. Deliberately **no `server-only` import** (reusable by the backfill); returns token usage for the caller to log.
- `generateTrack` calls it once after inserting milestones, logs usage as `tracker/priority`, non-blocking on failure. **No recompute triggers anywhere** — set once, stays fixed as cards move/are added. (Confirmed there was never a `/rank` route to drop.)
- **UI:** Auto mode orders the backlog by `priority_rank` and shows a sky `#n` badge with the reason as a hover tooltip — pure guidance, doesn't restrict opening. Manual mode hides the badge/order entirely (backlog in the learner's own order) and keeps the up/down arrows for self-sequencing (unchanged). `byColumn` sorts backlog by `priority_rank` in auto, by `position` otherwise; null ranks (pre-existing tracks) fall back to position with no badge.
- **Existing tracks:** `scripts/backfill-priority.mjs` (run once, after `018`) ranks any track whose backlog isn't yet ranked; idempotent; safe to delete after.

Zero TypeScript errors (`npx tsc --noEmit`, exit 0).

### Phase 16 — STEP 1: Decouple track generation from POST /api/dashboard/goals
Goal creation no longer blocks on track generation. The goals route inserts the
`learning_goals` row as `track_status='pending'` and returns immediately;
`generateTrack` (milestones + backlog priority) runs after the response.

- **Migration `019_goal_track_status.sql`** — `learning_goals.track_status TEXT NOT NULL DEFAULT 'ready'` + CHECK (`pending`|`ready`|`failed`); `REPLICA IDENTITY FULL`; adds the table to the `supabase_realtime` publication (guarded, idempotent). Existing rows default `ready`. **Must be run before this ships.**
- `app/api/dashboard/goals/route.ts` — returns as soon as `refineTopicPrompt` resolves + the goal row is inserted. `generateTrack` moved into `after()` (next/server) using a **service-role** client (cookie-bound request client isn't guaranteed valid post-response); its try/catch flips the row to `ready`/`failed`. `export const maxDuration = 60`.
- `RefinementFlow.tsx` — removed the fixed STAGES / 2.4s ticker. Waiting phase now subscribes to Supabase Realtime on the goal row (`postgres_changes` UPDATE, filtered by id), with a post-`SUBSCRIBED` status fetch as a race guard and a single-`settle` ref. New **failed** phase ("we couldn't build your track — goal is saved") instead of silently landing on an empty track.
- `GoalCard.tsx` — renders `pending` (spinner + "Building your track…", Start disabled) and `failed` (red badge, Start disabled) so a reload mid-build / a failed goal is never a silent dead end.
- `types/index.ts` — `TrackStatus`; `LearningGoal.track_status`.
- `globals.css` — `progress-slide` indeterminate shimmer (replaces the fake staged progress).

Static verification green: `npx tsc --noEmit`, `eslint`, `next build` all clean.
Live verification (create → fast response → populate → forced-failure shows `failed`) deferred to Travis — requires migration 019 applied + a real auth session.

> ⚠️ **DEPLOY-TARGET RISK (Hobby plan):** `after()` runs inside the same serverless
> invocation and is bound by the function timeout. Hobby caps at **10s regardless of
> `maxDuration`**, and `generateTrack` chains two Claude calls (milestones ~2k tokens +
> backlog priority) that routinely exceed 10s. On Hobby, `after()` will be killed
> mid-build → goals stuck `pending` or wrongly marked `failed`. **The `after()` approach
> is a stopgap; track-gen needs a real background job (Supabase Edge Function trigger /
> DB-trigger queue) before this is reliable in production.** The status column + Realtime
> + failed-state UI built here are reusable by that job unchanged.

### Phase 16 — STEP 2: Harden refine-phase error handling
The refinement asking phase could hang permanently: a 502 from `/api/dashboard/refine`
does **not** throw client-side, so the old `try/catch` never fired — `res.json()`
returned `{error}`, `data.done` was falsy, and `setQuestion(null)` left the UI stuck on a
disabled "Hugh is thinking…" state forever.

- `app/api/dashboard/refine/route.ts` — the Claude call + JSON parse now retry **once**
  before returning 502 (covers transient API/parse failures).
- `RefinementFlow.tsx` — new `tryRefine()` helper retries the request once and treats
  `!res.ok` **and** malformed payloads (neither `question` nor `done`) as failures, not
  just thrown network errors. On exhausted failure the flow **cannot stall**:
  - mid-refinement (≥1 answer): advance straight to the Waiting/build phase rather than
    looping on a broken endpoint;
  - first question (0 answers): show a generic prompt so the learner can still engage —
    answering it advances toward the MAX_QUESTIONS cap, which terminates into Waiting.

Verified live (dev server, auth-bypass): happy path → 200 + question; no auth → 401;
forced Claude failure (invalid ANTHROPIC_API_KEY) → **clean 502 in ~1.1s, no hang**.
Client "reaches Waiting rather than hanging" path verified by code/types + the confirmed
clean 502 (full browser-driven run needs a real auth session, same constraint as STEP 1).
`tsc`, `eslint`, `next build` all clean.

### Phase 16 — STEP 1 fix: "Building…" hang (found in live test)
Travis's localhost test: after submitting the refinement, the UI stuck on
"Building your learning track…". DB check showed the goal reached
`track_status='ready'` — so `after()`/`generateTrack` worked; the bug was purely
frontend: **Supabase Realtime never delivered the UPDATE** (the classic silent
drop on RLS-protected tables when the socket isn't authed), and the single
race-guard fetch had run instantly while still `pending`.

Fix in `RefinementFlow.tsx`: Realtime is now only the fast path. Added (a) a 3s
**poll** of `track_status` via the authed browser client — the reliable path that
doesn't depend on Realtime; (b) `realtime.setAuth(session.access_token)` so the
socket can actually receive RLS changes; (c) a **180s hard timeout** that surfaces
the failed state instead of hanging — which also covers the Vercel Hobby case
where the background build is killed and the row stays `pending` forever
([[after-hobby-limitation]]). All transitions funnel through the single-`settle`
guard; `cleanup` clears poll + timeout + channel.

### Phase 16 — STEP 1 hardening: stalled-goal safety
Closes the one residual dead-end before the Hobby test deploy. If a background
build is killed past `maxDuration` (or the tab closes before the client
watchdog), the goal row stays `pending` forever and a reload showed an endless
"Building…" spinner. `GoalCard` now treats a goal `pending` for more than
`STALL_MS` (5 min — safely beyond the 120s server cap) as **stalled**: red
warning, "Track build stalled — remove and re-add", disabled Start. Read-only
(no DB writes), so it also covers the closed-tab case. Computed client-side via a
`setTimeout` (delay clamped to 0) to avoid an SSR/CSR hydration mismatch and the
react-hooks "synchronous setState in effect" rule.

Context: Vercel Hobby + Fluid Compute allows up to 300s (verified against docs
2026-06-19), so `after()` track-gen is viable on Hobby; `maxDuration=120`.
Fluid Compute + env vars confirmed enabled by Travis. [[after-hobby-limitation]]

### Phase 17 — Mastery redo (practice) + learning summary document
Two-part refinement on the Mastery feature.

**Redo for practice (no bucket move):**
- A "Practice again" button on a Mastered card re-runs the voice session in place
  (the `/mastery/[id]` route already requires the `done` column, so nothing moves).
- `MasteryClient` gains an `alreadyMastered` mode: the result screen always frames
  as "Still mastered", offers "Save score & finish" + "Practice again", and the
  setup copy reflects a practice run. Score rule = **latest**: a practice finish
  PATCHes `mastery_score` (+ feedback) to the most recent run even if lower, and
  **never** sends `mastery_validated:false` — mastery is never revoked.

**Learning summary document (AI narrative, in-app + downloadable):**
- `migration 020_milestone_summary.sql` — `milestones.mastery_feedback`,
  `summary_doc`, `summary_doc_at`. **Must be applied before this ships.**
- `masterySummaryPrompt` (markdown out) builds a "what you learned" doc from the
  milestone, the checklist + coverage, the diary entries (incl. gap notes), and
  the latest mastery score/feedback.
- `POST /api/tracker/milestones/[id]/summary` — ownership + must-be-`done` →
  generate → store `summary_doc`/`summary_doc_at` → return. Logs `tracker/summary`.
- Auto-generated on first mastery (`MasteryClient.confirmMastery` also persists
  `mastery_feedback` then fires the summary POST, non-fatal). Practice runs do NOT
  auto-regenerate (on-demand only).
- `MilestoneDrawer` (mastered cards): renders the doc via `react-markdown` +
  `remark-gfm`, with **Regenerate** and **Download** (`.md` Blob) actions, or a
  "Generate summary" button when none exists yet. Reads the doc off the milestone
  (`select("*")`), keeps local state for regeneration.

Verified: `tsc --noEmit` clean, `next build` compiles. (Pre-existing eslint
warnings in untouched lines unchanged.) Live test pending Travis after applying
migration 020 — redo keeps mastery + updates score; summary auto-generates,
renders, downloads, regenerates. PDF export deferred to v2 (markdown only).

### Phase 17.1 — Summary generation moved to background (drawer-driven)
Per UX feedback: confirming mastery no longer waits on the summary. `confirmMastery`
now only validates + navigates (fast). The `MilestoneDrawer` auto-generates the
summary the first time a mastered card is opened without one — showing the existing
"Hugh is writing your summary…" state — via an effect keyed on the milestone id that
reads the milestone prop and defers the call with `setTimeout(0)` (keeps it out of
the effect body). Manual Regenerate/Download unchanged.

### Phase 18 — "What to understand" becomes a manual self-check
The AI coverage assessment was unreliable (it credited points that *Hugh* explained
in chat, not what the learner engaged with — even after the prompt fix it conflated
teaching with understanding). Coverage is now a manual self-assessment the learner
controls. AI still *generates* the checklist items (`learningPointsPrompt`); only
the determination of what's covered changed.

- `POST /api/tracker/milestones/[id]/coverage` — no longer calls Claude. Accepts
  `{ coveredIds }`, validates against the milestone's checklist, and persists into
  the existing `coverage.coveredIds` (no migration; existing marks kept). GET
  unchanged (still generates the checklist items once if missing).
- `coveragePrompt` removed from `lib/claude/prompts.ts` (dead).
- `ChecklistRail` (Ask side-rail) — each item is now a toggle that persists
  optimistically; removed the AI Refresh + chat-transcript wiring. Footer guides:
  "Tick each idea once you're confident you understand it."
- `AskWorkspace` — dropped the transcript ref + summarise-recompute plumbing.
- `MilestoneDrawer` — checklist items toggle on click; "Re-check" replaced with the
  same guidance; a dismissible amber **nudge** appears before starting Review /
  Mastery when items are still unticked ("you still have N unticked… you can carry
  on"). Never blocks (per decision: guidance + gentle nudge; existing marks kept).

tsc + next build clean. No migration. (Pre-existing eslint warnings unchanged.)

### Phase 19 — Token-cost optimization (Claude spend) ✅
Input tokens are ~83% of Claude spend, so all work is input-side.

**learn/chat prompt caching:** ephemeral cache breakpoint so the system prompt +
conversation prefix is reused across turns (cache reads ~0.1x). `tokensIn` now
counts `input_tokens + cache_creation_input_tokens`; cache reads excluded so a
warm cache eases the learner's quota. learn/chat was ~45% of spend.

**Monthly usage gauge:** `getUsageSummary()` + `<HeaderUsage />` temperature bar
(sky→amber→red) next to the username on all 7 page headers. Reuses the same
profiles columns + usage_logs window as `checkUsageAllowed` — no migration.

**Model selection (CLAUDE.md mandate relaxed):** Sonnet for reasoning-heavy,
Haiku for classification/short-gen. Moved to `claude-haiku-4-5` (5x cheaper
input): check-similarity, generate-hint, dashboard/refine (5-whys), mastery
open/respond. Mastery evaluate (scoring), quiz gen, fact-check, learn/summarize,
track gen, and interview feedback stay on Sonnet.

**Cap diary input:** mastery/session + review/quiz slice each entry body at 2000
chars (mirrors factCheck), bounding worst-case input tokens.

**Merge interview submit:** `submitAnswerPrompt` folds the alignment judgment into
generate-feedback — one Sonnet call returns {usedBestAnswer, alignmentScore,
feedback}, halving calls + duplicated context. useInterview drops
apiCheckSimilarity; usedBestAnswer persisted server-side. State machine unchanged.

tsc --noEmit clean; next build compiles (exit 0). No migration.

### Phase 20 — "What to understand" gains three states ✅
The self-check went from binary (understood / not) to three statuses so the learner
can flag awareness, not just completion: **understood** (green check), **bookmarked
for later** (amber bookmark), **still stuck** (red help). Purely an awareness aid —
it never gates mastery. The win is visibility: bookmarked/stuck counts now show on
the kanban card itself, so even in Review/Done columns the learner sees what to
circle back on.

- **Data model:** `MilestoneCoverage` changed from `{ coveredIds: string[] }` to
  `{ statuses: Record<string, PointStatus> }` where `PointStatus =
  'understood'|'bookmarked'|'stuck'` (absent = unstarted). No migration — the JSONB
  `coverage` field is normalized at read time via `normalizeCoverage()` in
  `utils/coverage.ts`, which maps any legacy `coveredIds[]` to `understood`.
- **Coverage route:** GET returns normalized coverage; POST accepts `{ statuses }`,
  validating ids against the checklist and values against the three statuses.
- **Shared UI:** `components/learn/PointStatusControl.tsx` — three mutually-exclusive
  icon toggles (click active to clear), with `STATUS_META` as the single source of
  icon/colour. Reused by `ChecklistRail` and `MilestoneDrawer`.
- **MilestoneCard:** top-right status summary — green-check / amber-bookmark /
  red-stuck icon+count chips, each shown only when its count >0 (untouched cards
  show nothing). Normalizes the raw milestone.coverage — no extra fetch. Purely
  visual; the grip handle yields the corner when chips are present.
- **Summary route:** "covered" for the mastery summary now means `understood`;
  bookmarked/stuck count as not-yet-covered so the summary can flag them.
- Mastery flow + nudge untouched (nudge keys on understood count, never blocks).

**Capture layer for future coaching (migration 021):** the snapshot in
`coverage` is current-state only — overwritten on every save, so history is lost.
Added an append-only `point_status_events` table to record every status change as
a transition (`from_status` → `to_status`, NULL = unstarted; only actual changes
logged), with RLS owner policy + indexes on (user_id, created_at) and
(milestone_id, point_id). The coverage POST route now diffs prev vs. new statuses
and inserts the transitions after writing the snapshot — best-effort, never blocks
the save. *What* we do with this data (trends, recurring confusion, time-to-
understanding, nudges) is deliberately deferred; the point is to start capturing
now since history can't be backfilled.

tsc --noEmit clean. **Migration 021 must be applied to Supabase.**

### Phase 21 — Pomodoro focus timer on the Ask page ✅
A 🍅 focus timer for the Ask page (scoped there only — Review has its own limit,
Converse has a finish line). Doubles as a caching optimization: during a focus
block the chat route switches its prompt cache to the 1-hour TTL.

- **`hooks/usePomodoro.ts`** — wall-clock timer (epoch `endsAt`, not interval
  counting) persisted to `localStorage` so it survives reloads/tab throttling;
  recomputes on `visibilitychange`. Phases: idle → focus → optional 5-min break.
  Pause/resume/stop; fires a transient `completed` signal at zero. Exposes
  `focusActive` (the cache-TTL flag) plus pure helpers `remainingOf` / `formatMmSs`.
- **`components/learn/PomodoroControl.tsx`** — tomato toggle + duration picker
  (15/25/50, 25 default); running countdown with pause/stop; on completion a
  Web-Audio chime + a dismissible toast offering a 5-min break (or "focus again"
  after a break). Never blocks asking.
- **`ChatWindow`** mounts the hook, renders the control in the toolbar (now
  `justify-between`, opposite Summarise), and sends `focusMode: pomo.focusActive`.
- **`/api/learn/chat`** sets `cache_control.ttl: "1h"` when `focusMode`, else the
  default 5-min. No beta header needed. Rationale: spaced study leaves >5-min gaps
  that would expire the 5-min cache; 1h write is 2x vs 1.25x but recovered after one
  avoided re-write. Measurable via existing `tokensIn` (incl. cache creation) logs.
- Free (not premium). No DB changes.

tsc --noEmit clean; timer helpers sanity-checked via node. No test runner in the
project (only `lint`); pure timer math kept in exported helpers for checkability.

### Phase 22 — Concise, takeaway-led Ask answers + deep-dive coaching ✅
Reshaped `focusedLearningSystemPrompt` (learn/chat). Justified on UX/differentiation,
not cost — output is the minority of spend (~17%) and more follow-up turns partly
offset the saving; the real win is readability and a distinct voice.

- **Concise + takeaway:** answers now lead with the single core idea in plain,
  jargon-light language, at most one example, and end with a `**Takeaway:** …`
  line tying it to why it matters for the topic. (Was: "thorough… 3–6 sentences.")
- **Deep-dive coaching:** instead of dumping exhaustive technical detail, Hugh
  answers narrow follow-ups directly but, for broad "teach me everything" depth,
  hands a copy-pasteable prompt (fenced code block) for the learner's own AI
  chatbot — framed as a power-move, not a brush-off. This also moves the expensive
  deep-generation off Hugh entirely (token-favourable) and teaches prompting.
- **Bring-it-back loop:** that handed prompt ends by asking the external chatbot
  for a concise, paste-ready summary (3–5 bullets + takeaway), and Hugh tells the
  learner to paste it into the card's diary. No new infra — the card diary
  (`milestone_entries`, text) already exists; there is no file-attachment system
  (the drawer's Paperclip icon is just a "Gap noted" label). True file uploads
  would need Supabase Storage + migration + UI — deferred.
- No UI change — `ChatBubble` already renders the bold takeaway + code block. Prompt
  text only; cache-safe (system prompt stays static within a session).
- **Copy button:** `ChatBubble` code blocks now render via a `CodeBlock` component
  with a top-right copy icon (flattens the node to text via `nodeText`, trims the
  trailing newline) — one-click hand-off of the deep-dive prompt.
- **Layout hardening:** longer coached responses exposed missing `min-w-0` on the
  flex chain — a wide code block expanded the chat column past the viewport, and
  the Ask page root is `overflow-hidden`, so it clipped with no scrollbar. Added
  `min-w-0` to the ChatWindow root + assistant bubble (with `break-words`) and
  `max-w-full` to the code `<pre>`, so wide content scrolls *inside* the block
  instead of blowing out the page. Also condensed the handed deep-dive prompt to a
  few focused lines (≈2–4 sentences).

tsc --noEmit clean. Next agenda (deferred): Markdown-capable diary + a real
external-chatbot session import/save-to-card flow (see memory).

### Phase 22.1 — Deep-dive prompt line formatting ✅
The handed deep-dive prompt was rendering as one run-on line and spilling
horizontally out of the code block. Two fixes: (1) `focusedLearningSystemPrompt`
now instructs Hugh to format the handed prompt across separate lines (one
instruction per line, blank line between parts, summary instruction on its own
final line); (2) `ChatBubble` code blocks gained `whitespace-pre-wrap break-words`
so long lines wrap inside the box instead of scrolling off-screen. tsc clean.

Future refinement (deferred): the deep-dive hand-off only triggers when the
learner asks to go deeper — non-intuitive. Surface it as an explicit **"Go Deep"**
affordance on the Ask card. Logged in memory.

### Phase 23 — Lint cleanup + learning-point tagging ✅

**Lint cleanup (0 errors / 0 warnings, from 20 / 9).** Next 16's `eslint-config-next`
ships the newer react-compiler-era `react-hooks` rules at error severity, which
flagged legitimate existing patterns. Fixed without weakening any rule globally
(kept them live for new code):
- Real fixes: hoisted `<Btn>` out of `AdminActions` render (`static-components` ×6);
  removed unused `redirect` import + a dead `profile` fetch (study page); escaped an
  apostrophe; `declare var`→`declare const` in `speech.d.ts` (×5); rewrote a
  ternary-statement; removed 2 stale `eslint-disable` directives in `useInterview`.
- `usePomodoro` refactor: replaced the `forceTick` counter with a `now` state so
  render is pure (kills `purity`) and folded completion-detection into the tick
  callback (kills both `set-state-in-effect` + a deps warning).
- Justified scoped disables only for intentional effect patterns (reset-on-id,
  mount-once celebration, timer-zero reveal, SSR-safe hydration).
- Untracked pitch decks (`presentation/`, `presentation-story/`,
  `HUGH_PRESENTATION.md`) added to `.gitignore`.

**Learning-point tagging.** Diary entries and saved Ask summaries can now be tagged
to one of the milestone's "What to understand" learning points, linking the diary
to the checklist.
- **Migration `022_entry_point_tag.sql`** — `milestone_entries.point_id TEXT`
  (nullable; soft ref to a `learning_points` JSONB id, not a hard FK) + index on
  `(milestone_id, point_id)`. **Must be applied before this ships.**
- `MilestoneEntry.point_id` added to types. `lib/tracker/points.ts`
  `isValidPointTag()` validates a tag against the milestone's points (null = OK);
  an invalid tag is dropped, not rejected.
- Routes: `save-summary` POST, `entries` POST, and `entries` PATCH (new re-tag
  path `{ pointId }`, plus optional `pointId` on edit) all accept + validate the tag.
- `components/learn/PointTagSelect.tsx` — reusable compact picker (renders nothing
  when the milestone has no checklist). Wired into **SummaryPanel** (Ask save) and
  the **MilestoneDrawer** write box.
- MilestoneDrawer diary: a `Tag` indicator on tagged rows, an inline re-tag select
  per entry, a per-point **note count** in "What to understand" that **click-to-filters**
  the diary to that point (with a clearable filter chip).

tsc --noEmit clean; eslint clean (0/0); next build compiles (exit 0). Live test
pending Travis after applying migration 022 — tag a summary/entry to a point, see
the count + filter, re-tag, clear.

### Phase 24 — Post-deploy refinements ✅

**Visible fact-check / re-check status (MilestoneDrawer).** The background
fact-check on diary save/edit only showed a tiny 12px spinner, easy to miss (and a
freshly-saved entry auto-opens). Now four coordinated signals using existing
`globals.css` animations — no new deps:
- an indeterminate `progress-slide` shimmer bar across the top of the verifying
  card + a sky border/tint;
- a legible "CHECKING" pill in the collapsed row (was a bare spinner);
- an expanded "✨ Hugh is fact-checking this entry" banner with bouncing dots, so
  the open view shows what's happening;
- the ✓/⚠ result (and correction panel) `fadeIn`s when the check completes.
Covers both paths: `submitEntry`→verify (new) and `saveEdit`→verify (re-check).

**App-wide Pomodoro (was Ask-page only).** The timer state already persisted
(wall-clock + localStorage) but only *rendered* in ChatWindow, so a running
session was invisible elsewhere. Lifted to a single app-level instance:
- `components/learn/PomodoroProvider.tsx` — runs the one `usePomodoro()` in the
  root layout, exposes `usePomodoroContext()` (single source of truth; no duplicate
  intervals or competing localStorage writers). ChatWindow now reads the context.
- `components/learn/PomodoroDock.tsx` — global floating countdown (bottom-right,
  z-50) shown wherever a session is active; owns the completion chime + break toast
  (moved out of PomodoroControl, so they fire on any page).
- `PomodoroControl` slimmed to the start-picker + inline countdown for the Ask
  toolbar. `app/layout.tsx` wraps children in the provider.
- Visibility: **silent** (no dock/toast/chime) on `/review/*`, `/mastery/*`,
  `/converse/*` (Converse route is future). On the Ask pages the floating countdown
  is hidden (inline control covers it) but chime/toast still fire. Dock appears only
  while a session runs; starting stays on the Ask page. (Decisions confirmed with
  Travis: hide on Mastery too; idle = hidden.)

tsc --noEmit clean; eslint clean (0/0); next build compiles (exit 0). No migration.

### Phase 25 — Pomodoro focus music ✅

Optional background music for focus sessions, attached to the Pomodoro widget.
- `lib/pomodoro/tracks.ts` — AUTO-GENERATED list of track URLs (string[]), produced
  by `scripts/gen-focus-tracks.mjs` from the files in `public/audio/focus/`. Re-run
  the script after adding/removing tracks. Empty list → music control hidden.
- `hooks/useFocusMusic.ts` — on/off preference only (no track picker), localStorage
  persisted; mounted once in PomodoroProvider (shared via `useFocusMusicContext`).
- `components/learn/FocusMusicPlayer.tsx` — always-mounted, invisible looping
  `<audio>` in the provider (survives navigation → continuous playback). Plays only
  while the timer widget is visible (session active AND not a silent route);
  **shuffles** — a random track plays and, when it ends, a different random track
  follows (non-looping, no back-to-back repeats); fades volume in/out (~700ms);
  autoplay-block safe (catches blocked play after a gesture-less reload).
- `components/learn/PomodoroMusicControl.tsx` — simple 🎵 on/off toggle, rendered in
  both the floating dock and the Ask-toolbar control. Off by default.
- Behaviour (confirmed with Travis): random track (38 tracks generated); off by
  default; plays only while the widget is visible so the off-switch is always next
  to the sound; fade in/out.

Note: 38 tracks (~161 MB) committed under `public/audio/focus/` — accepted repo
bloat for the MVP; easy to migrate to Supabase Storage / a CDN later (only the
generated URL list references them; the player is source-agnostic).

tsc --noEmit clean; eslint clean (0/0); next build compiles (exit 0). No migration.

### Phase 26 — Hugh Code: isolated Python playground (concept test) ✅

A standalone "coding feels like play" experiment, deliberately decoupled from
Track / Ask / Converse. An escalating ladder of Python micro-tasks under a
per-rung timer, with Hugh ghost-typing the reference solution alongside as a
pacer/teacher (not an opponent). Entirely client-side — no DB, no API routes, no
Claude/ElevenLabs, no API keys.

**Design (decided with Travis):**
- **Hugh = ghost/pacer**, not a competitor — he types his solution alongside for
  the learner to watch/learn from; copying is allowed (muscle memory). The real
  adversary is the clock.
- **Timer expiry = game over → restart the ladder from rung 1** (arcade stakes).
- **Correctness = hidden Python assertions** run after the learner's code in the
  same namespace (accepts any valid solution, not one phrasing).
- **Editor = CodeMirror 6** (`@uiw/react-codemirror` + `@codemirror/lang-python`
  + `@codemirror/theme-one-dark`).
- On game over, Hugh's **full** solution is revealed as a learning moment.

**Execution: Pyodide (WASM) in a Web Worker.**
- `lib/code/pyodide.worker.ts` — loads Pyodide from the jsDelivr CDN
  (`v0.26.4`, lazy, ~7 MB, only on this route so it never bloats the rest of the
  app). Fresh namespace (`toPy({})`) per attempt so variables never leak between
  rungs; captures stdout; returns `{passed, stdout, error}` (last traceback line).
  Typed against `globalThis` (not the webworker lib) to avoid duplicate-global
  conflicts with the project's `dom` lib setting.
- `lib/code/pyodideClient.ts` — `PyodideRunner` class: main-thread wrapper,
  correlates runs by id, and enforces a **6s hard exec timeout** — a runaway
  `while True:` can't freeze the UI; the worker is terminated and respawned and
  the run returns an "infinite loop" error. Browser-only guard.

**Content:** `lib/code/tasks.ts` — 15-rung `CodeTask[]` ladder (declare → assign →
sum → string → f-string → bool → if/else → list → index → loop-sum → function →
branch-function → dict → comprehension → fizz). Each rung: `prompt`, `starterCode`,
`hughSolution`, `assertions`, optional `timerSeconds` (10s default, widening to
12–20s on harder rungs).

**State machine** (`hooks/useCodeLadder.ts`):
`LOADING_RUNTIME → READY → RACING → CHECKING → PASS → (auto-advance) | GAME_OVER → restart | WON`.
Clock pauses during CHECKING (exec time isn't held against the run); 100ms
deadline-based countdown; ref mirrors for stale-closure-proof interval/async submit
(project convention). `hooks/useHughTyping.ts` drives the char-by-char ghost typing,
active only while RACING, resets per rung.

**Types:** `types/code.ts` — `CodeTask`, `LadderState`, `RunResult` (kept separate
from `types/index.ts` to keep the experiment decoupled).

**UI** (`components/code/`, all within `h-screen` no-scroll): `CodePlayground`
(orchestrator), `CmEditor` (shared CodeMirror wrapper), `TaskPrompt`,
`CountdownTimer` (SVG ring, reddens in the final third), `LadderProgress` (dots),
`RunConsole`, `ResultOverlay` (game-over / won). `app/code/page.tsx` — no auth gate
(self-contained concept test; gate later if it graduates). ⌘/Ctrl+Enter to run.

**Verification:** `tsc --noEmit` clean. Playwright smoke test (dev :3001) drove the
full loop end-to-end: Pyodide booted in the worker, Hugh ghost-typed `x = 5`, the
learner's `x = 5` passed the hidden assertions and advanced rung 1 → 2, zero
console/page errors. Screenshots confirm layout fits the viewport with no scroll.

Deps added: `@uiw/react-codemirror`, `@codemirror/lang-python`,
`@codemirror/theme-one-dark`. No migration.

### Phase 27 — Architecture-health dashboard (dev tooling) ✅

A local, standalone tool to visualize the structural health of the codebase.
Lives entirely in `tools/architecture-dashboard/` and **never touches app code** —
it only reads source files and git history. Not shipped to users; a maintenance
aid for spotting refactor targets.

**Phase 1 — static scan + report.** `scripts/architecture-scan.js` walks Hugh's
real source roots (`app/ components/ hooks/ lib/ types/ utils/` — there is no
`src/`, so the spec's "walk src/" was adapted) and builds an internal import
dependency graph. Import resolution understands relative paths and the `@/*`
alias from `tsconfig.json`; bare specifiers (node_modules) are treated as
external and excluded from the graph. Per file it computes: `loc` (non-blank
lines), `fanIn`/`fanOut`, `complexity = fanIn + fanOut`, `churn` (commits in the
last 30 days, from `git log`), and `hotspotScore = normalize(churn) ×
normalize(complexity)` scaled 0–100 — high only when a file is *both* heavily
coupled *and* frequently changed. Writes `architecture-data.json`
(`{components, edges, recentChanges, …}`). First run: 134 files, 263 edges; top
hotspot `types/index.ts` (47).

`dashboard.html` (plain HTML/CSS/JS, no build step) reads that JSON and renders a
component grid (tiles **sized by LOC**, **colored green/amber/red by
hotspotScore**, hover for full metrics), a sorted top-hotspots list, and a
recent-changes feed from git.

**Phase 2 — live mode.** `scripts/watch.js` (chokidar, the only external dep)
re-runs the scan on any source save (debounced 300ms) and rewrites the JSON. The
dashboard polls every 5s and **diffs old vs new** — only changed tiles update
(and flash); the hotspots list and changes feed replace in place. No full reload.

Also added `scripts/serve.js`, a zero-dependency static server (Node `http`),
because browsers block `fetch()` on `file://` pages; includes an encoded-path-
traversal guard. `npm run scan | watch | serve`.

**Verification:** scan runs clean (134 files); server returns 200 for the
dashboard and JSON, 403 on encoded traversal; watcher boots and does its initial
scan. The 14 files with `lastModified: null` are the as-yet-uncommitted `code/`
additions — correctly handled (no git history).

**Phase 27.1 — more views.** Added a **Grid / Graph view switcher** (no scan or
dependency change — all client-side rendering off the same `architecture-data.json`):
- Grid gained a **size-by toggle**: *Code size (LOC)* (area ∝ lines) vs *Usage
  (fan-in)* (area ∝ how many files import it). Clarifies that the original grid
  sized by code size, not usage.
- New **Graph (DAG) view**: an interactive force-directed dependency graph
  (nodes = files sized by LOC / colored by hotspot / bordered by source root;
  directed arrows = imports). Hover traces deps — outgoing edges blue, incoming
  orange, rest dim; drag-to-pin, click-to-unpin, drag-bg pan, scroll zoom,
  per-source-root filters, and a Re-layout button. Hand-written canvas force
  sim — no graph library, chokidar remains the only dependency.
- Verified headless (Playwright): both views render, sizing toggle resizes 134
  tiles, graph paints nodes+edges on an 852×528 canvas, 6 root filters,
  hover/reheat/filter all exercised, zero console errors. Screenshots confirm
  layout.

**Phase 27.2 — Flow (Lifecycle) view + teaching angle.** Added a third tab: a
UML-style **sequence diagram of the "fire off Hugh" loop** (the interview cycle)
across six actors — Browser → Page/UI → Hook → API route → Claude/ElevenLabs →
Supabase. 12 curated steps (faithful to the real code: `useInterview` →
`fetch('/api/interview/*')` → auth → `anthropic.messages.create` →
Supabase persist → back), each with the real file path and a **transferable
takeaway** (trust boundary, single source of truth, right-size the model,
explicit state machine, unidirectional data flow, …) — the view doubles as a
learning tool for applying Hugh's patterns in software-dev roles. Prev/Next,
click-a-step, and an animated **Play sequence**. Stat chips (pages / API routes /
hooks / components / lib modules) counted live from the scan. SVG sequence
diagram is generated in-page; runtime order is curated (a static import graph
can't infer temporal order) but file refs + stats are live from
`architecture-data.json`. No scan/dependency change. Verified headless
(Playwright): 12 steps render, click/Next/Play all work, lane labels fit, zero
console errors.

**Phase 27.3 — Admin console + assistant + Grid/Graph interactions.** The
dashboard grew from a static report into a small local admin app (still one
external dep, chokidar; the server + assistant use Node built-ins + global fetch).

- **`serve.js` is now a server** with `/api/config`, `/api/source` (read-only repo
  source, traversal-guarded), and `/api/assistant`. New **`assistant.js`** runs an
  **OpenAI** function-calling loop (model via `OPENAI_MODEL`, default gpt-4o; key
  `OPENAI_API_KEY` in `.env.local`, server-side only). Tools: read_file,
  list_files, git_log, architecture_summary, npm_latest, web_fetch — so the
  floating **💬 admin assistant** answers from the real repo, recent git, and live
  library release notes (the requested "recent developments"). Chosen provider is
  OpenAI per request, even though the app uses Anthropic.
- **Admin tab** embeds the real Hugh `/admin` via iframe (`HUGH_ADMIN_URL`,
  default localhost:3000/admin) — one place for architecture + ops. Open-in-tab +
  reload + fallback note included.
- **Grid single-click** → source code panel below the grid (via /api/source).
  **Grid double-click** → dependency map: importers → file → imports, left→right,
  on a continuous green→yellow→red complexity scale; hub files cap each column at
  12 with a "+N more" placeholder (verified on lib/supabase/server.ts, 47
  importers → readable). **Graph single-click** → sticky pinned highlight (fixes
  highlight vanishing on mouse-off). **Graph double-click** → focus mode (node +
  neighbours only).
- `.env.example` documents the three dev-only dashboard vars. Verified headless
  (Playwright): all interactions work, traversal blocked (403), assistant returns
  a graceful setup message with no key, zero console errors. Bookmarked
  AI-assistant idea is now shipped (admin-focused). Later verified **live**
  against a real OPENAI_API_KEY (gpt-4o): the assistant read
  app/api/interview/generate-question/route.ts and answered accurately. Added
  App-Router path guidance to the system prompt + near-match suggestions in
  read_file so the model recovers from a wrong-path guess instead of giving up.

**Phase 27.4 — assistant UX polish (Hugh ghost).** The floating chat is now
**draggable by its header** (clamped to the viewport) and the 💬 FAB follows the
panel as one unit. Rebranded around the **Hugh ghost mascot** (`public/ghost.png`):
ghost FAB with bob + cyan glow animation, ghost avatar in the header, a faded
ghost watermark in the empty chat, animated typing dots, and a cyan
(ghost-colored) accent for the FAB/user bubbles/send button to tie it to the
theme. `serve.js` gained a guarded read-only `/public/` route to serve the
mascot (image MIME types added). Verified headless: image serves (200), path
traversal blocked, drag + FAB-follow work, typing indicator + watermark toggle
on send, live query rendered correctly. Cyan added to the palette as `--ghost`.

**Phase 27.5 — one-command launch.** Added `npm run dashboard`
(`scripts/dashboard.js`): initial scan → live chokidar watcher → server → opens
the browser, all in one process (Ctrl+C stops it). It's the everyday entry point.
Decided against an `/admin`-style **app route**: the dashboard is a local dev tool
(reads the filesystem + git at runtime), so it can't be a deployed Vercel route
the way `/admin` is — keeping it standalone preserves the original
"touches no app code" design goal. Verified the launcher serves the page, data,
and mascot (all 200) with the watcher live.

### Phase 28 — Hosted, admin-gated architecture page in the app ✅

Made the dashboard reachable as **`/admin/architecture`** inside the Hugh app
(mobile-friendly, no `npm run serve`), behind the **existing admin login** — one
place for admin + architecture. The standalone local tool is unchanged; this is
its hosted, snapshot sibling.

**Auth.** Extracted the admin check into `lib/auth/requireAdmin.ts` (DRY):
`requireAdminPage()` (redirect → /login if signed out, → /home if not admin) and
`requireAdminApi()` (returns 401/403 as `NextResponse`). Refactored
`app/admin/page.tsx` onto it and added an "Architecture" header link.

**Routes (all gated).**
- `app/admin/architecture/page.tsx` — `requireAdminPage()`, then iframes the UI
  in `?hosted=1` mode.
- `app/api/architecture/data/route.ts` — `requireAdminApi()` → build-time scan JSON.
- `app/api/architecture/chat/route.ts` — `requireAdminApi()` → **OpenAI SDK**
  (`gpt-4o`, `OPENAI_API_KEY`) grounded ONLY in the scan snapshot (components,
  hotspots, dependency counts, recent changes). No filesystem/git/source access →
  can't leak source or secrets; key stays server-side. (Matches the local tool's
  provider. Deploy note: add `OPENAI_API_KEY` to Vercel env — it isn't there yet.)

**Build pipeline.** `tools/.../scripts/build-hosted.js` (from the app's
`predev`/`prebuild`) scans → `lib/architecture/data.generated.json` (imported by
the routes, bundled at build) and copies `dashboard.html` + `ghost.png` →
`public/admin-architecture/` (single source of truth stays the tool's
dashboard.html). `architecture-scan.js` gained `--out` / `runScan(outPath)`. Both
generated paths git-ignored.

**Hosted mode** (`?hosted=1` in dashboard.html): data ← `/api/architecture/data`,
chat ← `/api/architecture/chat`, admin tab → `/admin`, source-code view disabled
(no serverless FS), slower poll. Local mode unchanged.

**Security verified at runtime** (next dev): unauthenticated
`/api/architecture/data` and `/chat` → **401**, `/admin/architecture` →
**307 → /login**, the generated JSON → **404** (not public); only the data-less UI
shell is reachable. `tsc --noEmit` and ESLint clean. (Authenticated happy-path —
an actual Claude reply — not runtime-tested; needs a logged-in admin session, but
mirrors the production learn/chat route.)

**Trade-off:** hosted data is a **per-deploy snapshot** (scan at build; Vercel has
no live git/FS at request time). The local tool stays fully live; the code-viewer
stays local-only by design.
