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
