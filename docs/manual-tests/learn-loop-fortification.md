# Manual test — Learn loop fortification + legacy deletion

Covers the two commits `f540684` (fortification) and `5324b56` (deleting
`/interview` and `/tracker`). Work top to bottom; step 0 is not optional.

---

## 0. Apply migration 046 first

**Nothing below works until this is applied.** The code reads
`learning_goals.track_started_at`; the column does not exist yet in your
database. Supabase migrations here are manual — paste this into the Supabase
Dashboard SQL editor and run it:

```sql
ALTER TABLE learning_goals
  ADD COLUMN IF NOT EXISTS track_started_at TIMESTAMPTZ;

UPDATE learning_goals
   SET track_started_at = created_at
 WHERE track_started_at IS NULL;

ALTER TABLE learning_goals
  ALTER COLUMN track_started_at SET DEFAULT NOW();
```

It is safe to re-run. Backfilling from `created_at` means existing goals keep
today's behaviour.

**Symptom if you skip it:** creating a goal fails, or the dashboard cards show
the wrong build state.

---

## 1. Automated checks (run these before opening a browser)

```bash
npm run test
```

Expect **925 passed, 44 files**. The two new files are
`lib/tracker/generate.test.ts` (12) and `lib/tracker/buildState.test.ts` (25).

```bash
npx tsc --noEmit
```

Expect no output. If you see errors mentioning `.next/types/validator.ts` and
deleted routes, your build cache is stale — `rm -rf .next` and re-run.

```bash
npm run lint
```

Expect no output.

```bash
npm run build
```

Expect success. In the route table, confirm **`/interview`, `/interview/[room]`,
`/tracker` and `/api/tracker/generate` are absent** and **`/api/tts` and
`/api/dashboard/goals/[id]/retry` are present**.

---

## 2. Nothing is broken — the regression pass

Start the app:

```bash
npm run dev
```

Sign in with the test learner (`node scripts/seed-test-user.mjs --reset` if you
want a clean slate).

| # | Do this | Expect |
|---|---|---|
| 2.1 | Open `/home` | Six live cards + the four "Coming soon" tiles. No console errors. |
| 2.2 | Open `/home/learn` | Your goals list renders. **No** amber "complete 5 questions" notice — that was interview's, and it is gone. |
| 2.3 | Open an existing ready goal | The Kanban board renders exactly as before. |
| 2.4 | Open a milestone drawer → **Ask Hugh** | Chat works, diary saves. |
| 2.5 | Review quiz on a milestone with diary entries | Quiz generates and grades. |
| 2.6 | **Mastery on a mastered milestone** | This is the one most at risk. Hugh's **voice must play** — TTS moved from `/api/interview/tts` to `/api/tts`. Check the Network tab for `POST /api/tts` returning 200. |
| 2.7 | Finish/exit mastery | You land back on the goal's board, not a 404. |
| 2.8 | Visit `/interview` and `/tracker` directly | **404.** That is correct. |
| 2.9 | `/code`, `/cases`, `/cloud`, `/notes`, `/monitor` | All unchanged. |

**If 2.6 fails**, that is the deletion breaking mastery — stop and report it.

---

## 3. The new behaviour — happy path

| # | Do this | Expect |
|---|---|---|
| 3.1 | `/home/learn` → create a goal, answer the refinement questions | Card shows "Building your track…" with a spinner. |
| 3.2 | Wait | Card flips to Start on its own, no reload needed. |
| 3.3 | Click **Start** | Board renders with milestones. |

---

## 4. The new behaviour — failure paths

This is what the work was for. You have to force these; they will not happen
on their own.

### 4.1 A failed build shows a Rebuild button

Pick a goal you do not mind breaking. In the Supabase SQL editor:

```sql
UPDATE learning_goals SET track_status = 'failed' WHERE id = '<goal-id>';
```

- On `/home/learn`: red warning icon, "Track build failed — rebuild to try
  again", and a **Rebuild** button beside Start.
  *Before this change it said "remove and re-add to try again" with no button.*
- Open `/study/<goal-id>/track`: the page says **"Track build failed"** with a
  **Rebuild track** button.
  *Before this change it said "may still be generating, refresh in a moment" —
  advice that could never work.*

### 4.2 Rebuild actually rebuilds

Click **Rebuild track**. Expect:

- The panel switches to "Building your track" with a spinner.
- Within ~30–90s the board opens **by itself** — no manual refresh.
- In Supabase, `learning_goals.track_started_at` is now recent, and the goal has
  exactly one row in `tracks`.

### 4.3 A stalled build is not mistaken for a running one

```sql
UPDATE learning_goals
   SET track_status = 'pending',
       track_started_at = NOW() - INTERVAL '10 minutes'
 WHERE id = '<goal-id>';
```

- `/home/learn` shows "Track build stopped partway — rebuild to try again" plus
  the Rebuild button (not an endless spinner).
- The track page shows the stalled copy and a Rebuild button.

Then set `track_started_at = NOW()` with status still `pending`: both surfaces
should go back to **building**, with no Rebuild button. This is the check that
a retried goal is not instantly branded stalled.

### 4.4 An empty board is treated as broken

This is the original bug's fingerprint — a goal marked `ready` whose board has
nothing on it.

```sql
DELETE FROM milestones WHERE track_id = '<track-id>';
```

Open the goal. Expect **"This track has no milestones"** and a Rebuild button —
not a blank Kanban board.

### 4.5 The retry cannot be abused

While a build is genuinely in flight (status `pending`, `track_started_at`
recent), fire the endpoint directly:

```bash
curl -i -X POST http://localhost:3000/api/dashboard/goals/<goal-id>/retry
```

Expect **409** with "This track is still building". A healthy `ready` goal with
a populated board should give **409** "there is nothing to rebuild". Unauthenticated
should give **401**.

### 4.6 A failed save no longer looks like success

The hardest one to stage, and the reason for the whole batch. In Supabase,
temporarily revoke insert on milestones for your test user (or add a CHECK
constraint that rejects everything), then create a new goal.

Expect: the goal ends at **`track_status = 'failed'`** with a Rebuild button —
**and no orphan row in `tracks`** for that goal.

*Before: the goal went to `ready`, the track row stayed, and you got a silent
empty board.*

Undo the constraint afterwards.

---

## 5. The gates

| # | Do this | Expect |
|---|---|---|
| 5.1 | Type an off-domain topic ("learn guitar") on `/home/learn` | Blocked with the reframe chips, as before. |
| 5.2 | Bypass the browser check: `curl -X POST .../api/dashboard/goals` with an off-domain topic and a valid session cookie | **422** with the verdict body. *Before this change the server accepted it — the gate only ran in the browser.* |
| 5.3 | After any topic classification, check `usage_logs` | A row with `feature = 'learn/topic-domain'`. *Before this change the domain judge spent Haiku tokens and logged nothing.* |

---

## 6. Known, deliberate, not a bug

- **The free-plan session bar on `/home/learn` is frozen.** `checkSessionQuota`
  counts rows in `sessions`, which only the deleted interview loop ever wrote.
  The tables were kept (migrations are forward-only); the quota needs to move
  onto something the learner still does, which is a product decision.
- `Room` / `CoachingMode` types and the interview prompt builders in
  `lib/claude/prompts.ts` are dead code, left alone because that file is shared
  with the learn loop.
