# PRD v2 — Hugh Interview Coach (Phase 2)
**Version**: 2.0
**Status**: Ready for development
**Builds on**: PRD v1 (Phase 1 — core interview loop, auth, personas, TTS, STT, feedback)

---

## 1. What Phase 2 Adds

Phase 1 delivered the core interview loop: question → record → review → feedback. Phase 2 makes the experience intentional — users choose *how* they want to be coached, get scaffolding support (hints and ideal answers), and passive learners get a holistic end-of-session review rather than interruption after every answer.

Phase 2 also corrects two UX issues discovered in Phase 1 testing:
- The interview room was navigating between screens instead of updating in-place
- The live transcript was showing during recording (should only appear after stopping)

---

## 2. Phase 2 Feature List

| Feature | Description |
|---|---|
| Coaching mode toggle | Active (immediate feedback) or Passive (end-of-session summary) |
| Coaching mode lock | Locked per session, resettable only from room selection on break |
| Hint system | On-demand Claude-generated hint per question, with loading animation |
| Ideal Answer panel | Replaces "Show Best Answer" — collapsible, persists during recording |
| One-screen fix | All interview states render in-place, no page navigation |
| No live transcript fix | Transcript only appears after stopping, not during recording |
| Passive collection | Answers saved silently, no in-session feedback in passive mode |
| Session summary page | End-of-session page for passive mode: Q + transcript + ideal + feedback per question |
| Overall assessment | Short paragraph (Claude-generated) at top of summary page |
| 5-question minimum | Passive assessment blocked until 5 questions answered |

---

## 3. Updated User Flows

### 3.1 Session Start (Updated)
```
Room selection page
  → User sets coaching mode toggle: Active / Passive
    (toggle is global — one setting above all 3 room cards)
  → User clicks "Enter Room"
  → Session created with coaching_mode stored in Supabase
  → Coaching mode badge shown in PersonaBar (locked, read-only)
  → First question generated + TTS plays
  → State: PLAYING_QUESTION
```

### 3.2 Coaching Mode Lock Rule
```
Coaching mode is locked after the session is created.
To change it:
  → Click "Take a Break"
  → Redirected to room selection page
  → Toggle is now editable again
  → Enter room again = new session with new coaching mode
```

### 3.3 Ready State (Updated — Hint + Ideal Answer)
```
State: READY (audio finished)
  → Three options visible:
    1. "Hint" button (ghost, left)
    2. "Ideal Answer" button (ghost, centre-left)
    3. "I'm Ready" mic button (primary, right)

  Hint flow:
    → Click "Hint"
    → Loading animation plays (skeleton shimmer or pulse)
    → POST /api/interview/generate-hint → returns short nudge
    → Hint panel appears below question card
    → viewedHint = true (does NOT set viewedBestAnswer)

  Ideal Answer flow:
    → Click "Ideal Answer"
    → Ideal answer panel expands below question card
    → viewedBestAnswer = true
    → Panel has collapse toggle (chevron)
    → Panel stays visible into RECORDING state (collapsed by default)
    → Panel stays visible into REVIEWING state
```

### 3.4 Recording State (Updated — No Live Transcript)
```
State: RECORDING
  → Question shown small at top
  → If ideal answer was viewed: collapsed panel visible below question
  → Red pulsing "Recording..." indicator
  → "Stop Recording" button
  → NO live transcript during recording
  → "Take a Break" bottom-left

  On Stop:
    → State: REVIEWING
    → Transcript appears in editable textarea (first time it's visible)
```

### 3.5 Active Coaching Path (Unchanged from v1 + similarity)
```
REVIEWING → Submit Answer
  → State: SUBMITTING
  → check-similarity (Claude judges transcript vs ideal answer)
  → generate-feedback (context-aware: used ideal or own words)
  → TTS feedback audio
  → State: FEEDBACK
  → Waveform plays, feedback text shown
  → After audio: "Next Question" + "Take a Break"
```

### 3.6 Passive Coaching Path (New)
```
REVIEWING → Submit Answer
  → State: SUBMITTING
  → check-similarity runs (score stored, not shown to user)
  → generate-feedback runs (stored in answers table, not shown yet)
  → NO feedback audio, NO feedback display
  → State: PLAYING_QUESTION (next question, silently)
  → Answer count increments in PersonaBar
```

### 3.7 Passive — Take a Break (Updated)
```
User clicks "Take a Break" at any point

  IF answers_count < 5:
    → Session status = 'paused'
    → Redirect to room selection
    → Toast notification: "Complete at least 5 questions in your
      next session to unlock your session assessment."
    → No summary page shown

  IF answers_count >= 5:
    → Session status = 'completed'
    → generate-session-assessment called (overall paragraph)
    → Redirect to /interview/[room]/summary?session=[id]
```

### 3.8 Passive — Session Summary Page (New)
```
/interview/[room]/summary?session=[session_id]

Layout (scrollable — exception to no-scroll rule):
  ┌─────────────────────────────────────┐
  │ Overall Assessment (paragraph)       │
  │ Persona: Marcus · Room: DE · N Qs   │
  ├─────────────────────────────────────┤
  │ Q1: [question text]                  │
  │ Your answer: [transcript]            │
  │ Ideal answer: [best_answer]          │
  │ Feedback: [feedback_text]            │
  ├─────────────────────────────────────┤
  │ Q2 ... (repeats)                     │
  └─────────────────────────────────────┘
  [ Back to Room Selection ] button
```

---

## 4. Schema Changes

### `sessions` table — add column
```sql
ALTER TABLE sessions
ADD COLUMN coaching_mode TEXT
  NOT NULL DEFAULT 'active'
  CHECK (coaching_mode IN ('active', 'passive'));
```

### `questions` table — add column
```sql
ALTER TABLE questions
ADD COLUMN hint TEXT;
```
Hint is nullable — only populated when user requests it. Generated on demand and cached so repeat clicks don't re-call the API.

### Migration file
`supabase/migrations/002_phase2_schema.sql`

---

## 5. New & Updated API Routes

### NEW: `POST /api/interview/generate-hint`
**Purpose**: Generate a short nudge for the current question on demand.

Request:
```json
{
  "question": "Walk me through how you'd design a fault-tolerant pipeline.",
  "room": "data_engineering",
  "questionId": "uuid"
}
```
Response:
```json
{
  "hint": "Think about what happens when a stage fails mid-run — how would you ensure no data is lost or duplicated?"
}
```
Also saves hint to `questions.hint` column so repeat clicks return cached value, not a new API call.

### NEW: `POST /api/interview/generate-session-assessment`
**Purpose**: Generate overall session assessment paragraph for passive end page.

Request:
```json
{
  "sessionId": "uuid",
  "room": "data_engineering",
  "questionsAndAnswers": [
    {
      "question": "...",
      "transcript": "...",
      "feedback": "...",
      "usedBestAnswer": false
    }
  ]
}
```
Response:
```json
{
  "assessment": "You demonstrated solid foundational knowledge across most topics, particularly around pipeline design. Your answers would benefit from more concrete examples — specifics like tools, metrics, and real outcomes make responses land harder in interviews."
}
```

### UPDATED: `POST /api/interview/generate-feedback`
Now called in passive mode too — but result is stored silently in `answers.feedback_text`, not shown until summary page.

---

## 6. New Components

| Component | Purpose |
|---|---|
| `components/landing/CoachingToggle.tsx` | Active/Passive toggle on room selection page |
| `components/interview/HintPanel.tsx` | On-demand hint display with shimmer loading state |
| `components/interview/IdealAnswerPanel.tsx` | Collapsible ideal answer panel (replaces BestAnswerPanel) |
| `components/interview/CoachingBadge.tsx` | Read-only badge in PersonaBar showing locked coaching mode |
| `components/interview/SessionSummary.tsx` | Full passive end-of-session summary component |
| `components/interview/QuestionSummaryCard.tsx` | Single Q+transcript+ideal+feedback card within summary |

---

## 7. Updated Component Behaviour

### `PersonaBar` (updated)
Add `CoachingBadge` showing "Active" or "Passive" as a locked pill. Shows question count as answered/total (e.g. "Q 3").

### `useInterview` hook (updated)
- Accept `coachingMode: 'active' | 'passive'` from session
- In passive mode: after SUBMITTING → go to PLAYING_QUESTION, not FEEDBACK
- Track `answeredCount` for the 5-question gate
- Expose `viewedHint` and `viewedBestAnswer` as separate flags

### `app/interview/[room]/page.tsx` (updated)
- All 8 states render in-place — no `router.push()` between states
- Add `HintPanel` and `IdealAnswerPanel` to READY state
- Remove live transcript from RECORDING state
- Collapsed `IdealAnswerPanel` persists into RECORDING state if viewed

### `app/page.tsx` — room selection (updated)
- Add `CoachingToggle` above room cards
- Pass `coachingMode` into `createSession` Server Action

---

## 8. Claude Prompt Additions

### Hint Generation
```
System: You are a concise interview coach.
The candidate is being asked: [question]
This is a [room] interview.

Give a single-sentence hint that nudges them toward the right
approach without giving away the answer.
Do NOT mention the answer. Focus on the thinking framework or
key concept they should consider.
Return JSON only: { "hint": "..." }
```

### Session Assessment
```
System: You are a senior interview coach reviewing a candidate's
mock interview session.

Room: [room]
Questions answered: [N]

Here are the question/answer pairs with individual feedback:
[questionsAndAnswers as formatted list]

Write a 2-3 sentence overall assessment. Be direct and honest.
Highlight one strength and one area to develop.
Start with the candidate's biggest takeaway.
Return JSON only: { "assessment": "..." }
```

---

## 9. UX Fixes from Phase 1

These are corrections to be applied before or alongside Phase 2 features:

| Fix | Detail |
|---|---|
| One-screen interview | Remove any `router.push()` between interview states. All state transitions are in-place UI changes on `/interview/[room]` |
| No live transcript | `LiveTranscript` component only renders in REVIEWING state, not RECORDING |
| Ideal answer during recording | `IdealAnswerPanel` (if previously expanded) collapses to a compact bar during RECORDING, re-expands in REVIEWING |

---

## 10. Success Criteria (Phase 2)

- [ ] Coaching mode toggle visible on room selection page
- [ ] Selected coaching mode stored in session and shown as locked badge in PersonaBar
- [ ] Coaching mode cannot be changed mid-session
- [ ] "Hint" button generates hint on demand with loading animation, cached on repeat click
- [ ] "Ideal Answer" panel is collapsible and persists (collapsed) through RECORDING state
- [ ] Viewing hint does NOT set viewedBestAnswer
- [ ] Viewing ideal answer sets viewedBestAnswer = true
- [ ] No live transcript shown during RECORDING state
- [ ] All interview states render on one screen with no page navigation
- [ ] Active mode: feedback plays after every answer (unchanged from v1)
- [ ] Passive mode: no feedback shown after answers, session progresses silently
- [ ] Passive mode < 5 questions + break: toast notification shown, no summary page
- [ ] Passive mode ≥ 5 questions + break: redirect to /interview/[room]/summary
- [ ] Summary page shows overall assessment + Q+transcript+ideal answer+feedback per question
- [ ] Schema migration 002 runs cleanly against Supabase
