# PRD v3 — Hugh Interview Coach (Phase 3)
**Version**: 3.0
**Status**: Ready for development
**Builds on**: PRD v1 + PRD v2 (all features complete, no new features in this phase)
**Focus**: UX cohesion — consistent layout, natural reading flow, smooth transitions

---

## 1. Problem

Phase 1 and Phase 2 built all core features correctly. The issue is that each state change causes the entire layout to shift — question text repositions, buttons appear in different areas, and content jumps around the screen. The user's eye has no anchor point.

Root cause: no shared layout grid. Each state renders independently, treating the screen as a blank canvas.

---

## 2. Solution — Fixed Three-Zone Layout

Every interview state must use the same three-zone grid. Only the *content within each zone* changes between states. Nothing repositions.

```
┌──────────────────────────────────────────────────────┐
│  PERSONA BAR                                          │
│  Always locked to top. Never moves.                   │
│  height: 64px                                         │
├──────────────────────────────────────────────────────┤
│                                                       │
│  QUESTION ZONE                          ~35% height   │
│  Question text always lives here.                     │
│  Large (2xl) during PLAYING + READY                   │
│  Small (base) during RECORDING, REVIEWING,            │
│  SUBMITTING, FEEDBACK                                 │
│  Font size transitions smoothly — position NEVER      │
│  changes.                                             │
│                                                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  CONTENT ZONE                           flex-1        │
│  What changes between states.                         │
│  Content fades in/out on state change.                │
│  Never causes layout reflow.                          │
│                                                       │
├──────────────────────────────────────────────────────┤
│  ACTION ZONE                            ~120px        │
│  All buttons always live here.                        │
│  Fade in/out as available. Never reposition.          │
│  Vertically centred within the zone.                  │
└──────────────────────────────────────────────────────┘
```

### Layout implementation
```tsx
<div className="flex flex-col h-screen overflow-hidden">
  <PersonaBar />                                    // flex-none, h-16
  <div className="flex flex-col flex-1 max-w-3xl mx-auto w-full px-8">
    <QuestionZone />                                // flex-none, py-12
    <ContentZone className="flex-1 min-h-0" />     // flex-1, overflow-y-auto within
    <ActionZone className="flex-none py-8" />       // flex-none, ~120px
  </div>
</div>
```

`max-w-3xl mx-auto` centres content on wide screens. Without this, text and buttons feel lost on 1440px+ displays.

---

## 3. State-by-State Layout Spec

### PLAYING_QUESTION
**Question zone**: Large italic, centered within zone  
**Content zone**: Waveform, full width, vertically centred  
**Action zone**: Empty — no buttons visible

### READY
**Question zone**: Large italic (no change from PLAYING_QUESTION)  
**Content zone**: HintPanel (if loaded) + IdealAnswerPanel (if revealed), stacked vertically with gap-4  
**Action zone**: Three controls in a row — `[Hint]` ghost left · `[Ideal Answer]` ghost centre · `[I'm Ready]` primary mic right

### RECORDING
**Question zone**: Shrinks to small (smooth transition)  
**Content zone**: 
- If IdealAnswerPanel was viewed: collapsed bar at top of content zone
- Below it: centred recording indicator (pulsing red dot + "Recording..." text)  
**Action zone**: `[Stop Recording]` button, centred

### REVIEWING
**Question zone**: Small (stays small)  
**Content zone** — VERTICAL STACK, top to bottom:
1. IdealAnswerPanel — expanded (if viewed), collapsible
2. Transcript editor — full width below it
3. Helper text: "Correct any transcription errors before submitting"  
**Action zone**: `[Re-record]` ghost left · `[Submit Answer]` primary right

> ⚠️ This is the critical fix. Ideal answer and transcript editor must be VERTICAL, not side-by-side.

### SUBMITTING
**Question zone**: Small (stays)  
**Content zone**: Centred loading indicator — pulsing skeleton bar (not just faint text). Two lines: a wider shimmer bar + a narrower one below, in #1E293B with animate-pulse. Caption below: "Hugh is reviewing your answer..."  
**Action zone**: Empty

### FEEDBACK
**Question zone**: Small (stays)  
**Content zone**: Waveform full width + feedback text below (bold first sentence, then normal weight)  
**Action zone**: Hidden until audio ends, then fade in: `[Take a Break]` ghost left · `[Next Question]` primary right

---

## 4. Transition Behaviour

### Between states
Content zone: `opacity-0 → opacity-100` over 200ms on mount.  
Use a wrapper:
```tsx
<div key={state} className="animate-fadeIn flex flex-col flex-1 min-h-0">
  {/* content for this state */}
</div>
```
Define in `globals.css`:
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fadeIn {
  animation: fadeIn 200ms ease-out forwards;
}
```

### Question font size
Smooth CSS transition on the question text element:
```tsx
<p className={`italic font-serif transition-all duration-300 ease-out
  ${isLarge ? 'text-2xl leading-relaxed' : 'text-base leading-snug'}`}>
```
`isLarge` = true during PLAYING_QUESTION and READY. False for all other states.

### Buttons (action zone)
Use `transition-opacity duration-200` on all action zone content. Fade in when state arrives, no jump.

### Waveform
Same component (`WaveformPlayer`) used in both PLAYING_QUESTION and FEEDBACK. No remount — just pass `isPlaying` prop. This prevents the visual of the waveform "reappearing" from scratch in FEEDBACK.

---

## 5. Specific Component Changes

### `components/interview/InterviewRoom.tsx`
Full restructure around the three-zone grid. Replace current conditional rendering with:
```tsx
<PersonaBar ... />
<div className="flex flex-col flex-1 max-w-3xl mx-auto w-full px-8">
  <QuestionZone question={currentQuestion} isLarge={isLarge} />
  <div key={state} className="animate-fadeIn flex flex-col flex-1 min-h-0">
    {renderContentZone()}
  </div>
  <ActionZone>
    {renderActions()}
  </ActionZone>
</div>
```

### `components/interview/QuestionZone.tsx` (new)
Extracts question display into its own component. Accepts `isLarge: boolean`. Handles the font-size transition internally. This prevents question text from ever remounting between states.

### `components/interview/ActionZone.tsx` (new)
Wrapper for the bottom button area. Fixed height, vertically centred children, consistent padding. All button rows render here — never inside the content zone.

### `components/interview/SubmittingState.tsx` (new or inline)
Replaces the current faint "Hugh is reviewing your answer..." text.
Two animate-pulse skeleton bars (h-3, rounded, bg-[#1E293B], w-64 and w-40) centred in the content zone, with the caption below in muted text.

### `components/interview/IdealAnswerPanel.tsx` (update)
In REVIEWING state, must render at full width, not constrained to left half. Currently it appears top-left — it should be `w-full` and sit above the transcript editor in the same column.

### `components/interview/TranscriptEditor.tsx` (update)
In REVIEWING state, must be `w-full`, directly below IdealAnswerPanel. No side-by-side layout.

---

## 6. Content Fix — Intro Question Ideal Answer

The ideal answer for the intro question ("Tell me about yourself") currently returns a template with placeholders like `[Job Title]`, `[X] years`, `[Company Name]`. This is unhelpful scaffolding, not a useful model answer.

**Fix**: Update `introQuestionBestAnswerPrompt` in `lib/claude/prompts.ts` to generate an instructional ideal answer in prose form — explaining the *structure and approach* of a strong answer rather than a fill-in-the-blank template.

Example of correct output:
> "A strong answer follows a clear arc: where you've been, what you've built, and why this role is the natural next step. Open with your current role and the most relevant part of your background, name one specific accomplishment with a measurable outcome, then land on what you're looking to do next and why this role fits. Keep it under 90 seconds — confident, not comprehensive."

Update the prompt to produce this style for all intro question best answers.

---

## 7. Secondary Polish Items

These are small but improve the overall feel:

| Item | Fix |
|---|---|
| `max-w-3xl mx-auto` wrapper | Add to interview room so content isn't lost on wide displays |
| Recording indicator | Replace plain "Recording..." text with pulsing red dot + text side by side |
| Action zone consistency | All button rows use same height (`h-12` buttons), same gap (`gap-4`), same alignment |
| Persona bar avatar | If avatar image is missing, show initials in a coloured circle (already partially done — confirm it never shows broken image) |
| Waveform height | Standardise to 80px in both PLAYING_QUESTION and FEEDBACK so it doesn't visually "jump" in size |

---

## 8. What NOT to Change

- No new features
- No changes to API routes, hooks logic, or Supabase schema
- No changes to auth, session creation, or routing
- No changes to passive mode summary page (already scrollable, works correctly)
- `useInterview` state machine: do not touch

Only `InterviewRoom.tsx` and its child components change in Phase 3.

---

## 9. Success Criteria (Phase 3)

- [ ] All 6 interview states use the same three-zone grid
- [ ] Question text never repositions — only font size changes
- [ ] Content zone fades in on each state transition (no jump)
- [ ] REVIEWING state: ideal answer panel and transcript editor are stacked vertically, full width
- [ ] SUBMITTING state: pulsing skeleton bars, not faint text
- [ ] All buttons live in the action zone — none inside the content zone
- [ ] `max-w-3xl mx-auto` wrapper centres content on wide screens
- [ ] Recording indicator is a pulsing red dot + text, not just text
- [ ] Intro question ideal answer is instructional prose, not a placeholder template
- [ ] Waveform is same height in PLAYING_QUESTION and FEEDBACK
- [ ] Zero TypeScript errors
- [ ] No changes outside of InterviewRoom and its child components
