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

## Realtime mastery spends without logging — do not enable (found 2026-09-05)

`app/api/tracker/mastery/realtime-session/route.ts` calls `enforceUsageGate`
but never calls `logUsage`. That is the CLAUDE.md rule stated outright: "A
route that calls `enforceUsageGate` but never logs is a bug: it checks the
learner's budget and then spends against it invisibly."

The August audit already flagged this. It is **worse since migration 049**:
`enforceUsageGate` now *reserves* budget and `logUsage` is what converts the
reservation into recorded spend. With no log, the reservation expires
unconfirmed, the budget springs back, and OpenAI Realtime voice minutes — which
are not cheap — were spent with no record anywhere.

`MASTERY_REALTIME_ENABLED=true` in local `.env.local`; confirmed **off in
Vercel**, so this is not live. It is therefore not urgent, but it is the last
hole in the money path.

**Do not turn that flag on in production until the route logs usage**, naming
its model once for both the API call and the log, and accounting for both the
Realtime model and the transcription model.

Disclosure note: enabling it also sends learner **voice audio to OpenAI**, which
the privacy page would then have to say.

## Browser speech recognition sends audio to Google (found 2026-09-05)

`hooks/useSpeechRecognition.ts` uses `webkitSpeechRecognition`, live in
`/mastery`. CLAUDE.md describes the Web Speech API as "browser-native,
Chrome/Edge only", which reads as *processed on the device*. It is not: in
Chrome the API is server-based, so the learner's voice is sent to Google for
transcription.

Not a bug — it is how the API works — but it makes Google a data processor that
no document listed. Now covered on `/privacy`. Worth correcting the wording in
CLAUDE.md so nobody re-derives the wrong conclusion from it.
