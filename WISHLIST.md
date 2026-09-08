# Wishlist — Observed Improvements

Running list of rough edges and improvement ideas noticed while using the app.
Not scheduled work — pull from here when planning an improvement pass.

## /notes

- **Pagination requires a snip.** Right now you can't advance to the next
  page/image in the notes workspace without taking a screenshot (snip) first.
  Page navigation should be independent of that — able to move forward/back
  through pages on its own.
- **Same-page vs. next-page snip is unclear.** Adding another snip to the
  current page versus adding a snip that starts a new page is confusing —
  there's no clear system distinguishing the two actions. Needs a deliberate
  UX/flow for "add to this page" vs. "start next page."

## Privacy — pre-deployment blocker (raised 2026-08-30)

Not a rough edge. This needs a deliberate, meticulous pass before Hugh is put
in front of real users, and it should be treated as release-blocking.

- **No privacy policy or terms exist anywhere in the app.** Searched the repo:
  no `/privacy` route, no terms page, nothing in the signup flow, nothing in
  the UI. Signup is open — email verification, auto-approve.

- **The 5-whys answers became a PII store on 2026-08-29.** Migration 048
  persists them in `goal_answers`. The questions are model-generated and
  explicitly prompted to extract "real motivation, context, or background", so
  the answers are career circumstances — the test fixture's realistic example
  is "I have an interview next week", the kind of thing a learner is hiding
  from their employer. Before 048 these were never stored at all, which was
  unintentionally the strongest privacy posture in the product.

- **Learner disclosure and delete control — DONE 2026-08-31 (Q1 and Q2).**
  Q2: a quiet icon on the goal card opens what is stored and deletes it,
  leaving the track, board and diary untouched
  (`components/dashboard/GoalAnswers.tsx`,
  `/api/dashboard/goals/[id]/answers`). Q1: one line under the 5-whys question
  at the moment of answering, in `RefinementFlow.tsx`. This closes the
  `goal_answers` item only — it is the narrowest store in the list below, and
  the rest of this section is untouched.

- **Other stores to audit in the same pass**, not just this one: `/notes`
  (uploaded screenshots), the goal-from-document path (CVs and job
  descriptions — the richest personal material in the product), `/monitor`
  (resumes, cover letters, job applications), `operation_events`, and the
  retained server log drain.

- **Decide and write down, rather than leave implicit:** retention (048 keeps
  indefinitely with no TTL job, by decision), what an account deletion actually
  removes end to end, and what the Anthropic / OpenAI / ElevenLabs data-handling
  position is for learner text sent to them.

## Realtime mastery spends without logging — CLOSED 2026-09-08

`app/api/tracker/mastery/realtime-session/route.ts` calls `enforceUsageGate`
but never calls `logUsage`. That is the CLAUDE.md rule stated outright: "A
route that calls `enforceUsageGate` but never logs is a bug: it checks the
learner's budget and then spends against it invisibly."

**What it actually was.** Not a dropped line. That route mints an ephemeral
client secret and returns it; the session then runs browser-to-OpenAI over
WebRTC. At the moment that route runs, nothing has been spent and there is no
figure to log. The spend is never visible to the server at all.

**The fix (2026-09-08).** The Realtime API reports usage over the data channel,
in two places that are not the same source: `response.done` carries the coach
model's tokens, and `conversation.item.input_audio_transcription.completed`
carries the transcription model's, which is *not* included in the first. The
transport now folds both into totals, the hook reports them when the session
ends (and beacons them on unload), and
`app/api/tracker/mastery/realtime-usage/route.ts` bounds and logs them.

Three rows per session, not one: realtime audio, realtime text and
transcription price differently — audio input is 10.00 against text's 0.60, a
16x spread — so all three are registered separately in `lib/pricing.ts`. Before
this, none of the three existed there at all, so even a logged session would
have been priced at the Sonnet fallback.

The browser supplies the figures, so they are **bounded, not trusted**:
`boundTotals` clamps each bucket to what a session of `MAX_SESSION_SECONDS`
could physically emit, using the server's own config rather than anything in
the request.

**Residual, accepted and documented:** a learner who closes the laptop
mid-session reports nothing, the reservation expires, and that spend is lost.
`sendBeacon` covers most of it, not all. The `mastery.realtime` operation is
flagged `failureIsSilent` for exactly this reason, and an empty report is
recorded as a failure so /admin/features can count how often it happens.

**Also worth knowing:** what gets recorded is what the API reported, which is
not guaranteed to match the provider's billing meter, and the token breakdown
is sometimes omitted. When the split is missing, everything is attributed to
audio — the expensive class — so an unknown mix can never hide spend.

The August audit already flagged this. It is **worse since migration 049**:
`enforceUsageGate` now *reserves* budget and `logUsage` is what converts the
reservation into recorded spend. With no log, the reservation expires
unconfirmed, the budget springs back, and OpenAI Realtime voice minutes — which
are not cheap — were spent with no record anywhere.

`MASTERY_REALTIME_ENABLED=true` in local `.env.local`; confirmed **off in
Vercel**, so this was never live.

**The money blocker is closed. A privacy blocker is not.** Enabling the flag
sends learner **voice audio to OpenAI**, and `/privacy` does not say so — it
currently discloses ElevenLabs (which receives text, not voice) and the
browser's Google-backed speech recognition, and nothing else. That disclosure
has to be written before the flag goes on in production.

**Still untested end to end.** The pure accumulator has tests and the transport
has tests, but no realtime session has ever run against this code — the flag has
never been on. First enable should be watched, with /admin/features open.

## Browser speech recognition sends audio to Google (found 2026-09-05)

`hooks/useSpeechRecognition.ts` uses `webkitSpeechRecognition`, live in
`/mastery`. CLAUDE.md describes the Web Speech API as "browser-native,
Chrome/Edge only", which reads as *processed on the device*. It is not: in
Chrome the API is server-based, so the learner's voice is sent to Google for
transcription.

Not a bug — it is how the API works — but it makes Google a data processor that
no document listed. Now covered on `/privacy`. Worth correcting the wording in
CLAUDE.md so nobody re-derives the wrong conclusion from it.

## The angle chips read as the only three options (noticed 2026-09-09)

When the topic gate returns `needs_angle` — "Generative AI covers a lot of
ground…" — `TopicGateNotice` shows **Pick an angle** and three suggestion
chips. Travis: it feels rigid. There should be a way to say "none of these"
and phrase your own angle, with the guard rail still applied to what you type.

**The machinery for this already exists.** A chip calls `onPickSuggestion`,
which in `DashboardPanel` is `handleTopicChange` — it writes the suggestion
into the topic input and clears the notice. It does not submit. The learner
still presses "Let's Discuss", and the gate re-runs on whatever text is in the
box. So typing your own angle is already possible today; the notice just never
says so, and three chips under an imperative heading read as a closed set.

That makes the first half mostly copy and affordance — an explicit "or describe
it yourself" that points at the field above, or a fourth chip that focuses the
input rather than filling it.

**The second half is a real open question.** Today a typed angle that still
fails gets the same notice again — the same three chips, or a decline if the
verdict flipped to `out`. That is a loop, not guidance. "Guide the learner into
a topic that fits the domain" needs a decision about what the second and third
attempt look like, and that has to hold the line the gate exists to hold: the
domain stays data/analytics ([[domain-gate-scope-decision]]), so this is about
helping someone find their way in, never about letting them argue their way in.

Files: `components/dashboard/TopicGateNotice.tsx`,
`components/dashboard/DashboardPanel.tsx`, `DocumentUploadFlow.tsx` (the review
step renders the same notice).
