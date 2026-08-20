# Monitor — PRD and Architecture Proposal

Status: **Phases A and B shipped**; Phase C pending. Written 2026-08-20 after
the four open questions on the prototype were answered, and kept current as
things change. Prototype: `docs/prototypes/monitor.html`.

This document supersedes the "Before I build" section of the prototype.

---

## 1. What Monitor is

A tracking surface at `/monitor`. Four views, one shell, one home card.

Monitor is the first thing in Hugh that is **purely a record rather than a
teacher**. It generates nothing, judges nothing, and spends no tokens. Every
other surface in Hugh asks something of the learner and answers back; Monitor
only shows them what they already did.

### Goal
Give a learner one place to see their own effort over time — what they set out
to learn, what they actually did about it, and where they applied for work —
without Hugh deciding any of it for them.

### Users
Logged-in Hugh learners. Every view ships to everyone (see §2.3).

### The views

**Skills** — the learner types in a skill they want to learn. Each day they
touch it, they tick it and write a diary line. One calendar heatmap per skill.
Skills are free text, fully independent of `learning_goals` and milestones —
deliberately, so Monitor can track something Hugh doesn't teach.

**Applications** — job applications, shaped like `/notes`: the job description,
the title applied for, the cover letter and résumé actually sent, and a status.
A list opens into a full-width detail view. Above the list, a daily stacked
column chart of applications sent, coloured by current status.

**Documents** — the résumé and cover-letter repository. Added after Phases A
and B, when it became clear that a library reachable only through an application
is not a library: you maintain CVs whether or not you applied to anything today.
Each version shows how it actually performed.

**Usage** — one calendar heatmap per Hugh surface. The only view the learner
does not fill in.

### Out of scope for v1
- Any AI. No generation, no scoring, no coaching, no `logUsage`.
- Resizable panes. Applications has three fixed panes; Notes' draggable
  dividers are not copied.
- Uploaded files. Cover letters and résumés are pasted text, per the prototype's
  own recommendation — Storage, a bucket policy and size limits can come later.
- Reminders, streaks, nudges, "don't break the chain" framing. Monitor records;
  it does not pressure. This follows the rule already stated in
  `components/code/ProgressHeatmap.tsx`.
- Import from anywhere. Everything is typed in by hand.

### Success criteria
1. A learner can add a skill, tick a day with a note, and see it appear on that
   skill's heatmap — in under fifteen seconds, without leaving the page.
2. A learner can record an application with all five fields, and find it again
   by company or status.
3. Every surface listed in the Usage view shows real data — no permanently
   blank calendar for a surface that is genuinely being used (§3.4).
4. The page never scrolls. Panes scroll internally (§2.2).
5. Zero token spend attributable to `/monitor`.

---

## 2. The four answers

These were the open questions on the prototype. All four are now settled.

### 2.1 Tabs, not routes — approved
One `/monitor` shell with tabs (three at the time; Documents was added later). Applications can open a full-width detail
view the way `/notes` does.

Tab state lives in the URL as `/monitor?view=skills|applications|documents|usage` so the
back button and a bookmarked link both work. The detail view is
`?view=applications&app=<id>`. This is search-param state on one route, not
three routes: one home card, one mental model, one layout shell.

### 2.2 Scroll exception — approved
Monitor gets the same exception `/notes` has: **the page is locked to the
viewport (`h-screen`, no page scroll); panes scroll internally.**

Six skills fit a viewport. Forty applications do not, and neither does a year of
diary entries. This is an edit to Architecture Rule 4 in `CLAUDE.md` and is
listed as a deliverable in §5.

The exception is narrow and stated as such: Monitor and Notes are the two
records tools. It does not extend to any teaching surface.

### 2.3 Applications ships to everyone — approved
Not gated to a single account.

The concern raised at prototype time stands on the record: a job-application
tracker is career admin, and it is the first thing in Hugh with no connection to
data and analytics — the drift the topic gate exists to stop. The call is to
ship it, with **honest framing rather than a hidden feature**.

So the framing is a deliverable, not decoration:
- The `/home` Monitor card carries a subheading naming all three views, so no
  learner clicks in expecting a learning tool and finds a job tracker.
- The Applications tab carries its own subheading saying plainly what it is —
  a private record of where you applied and what you sent.

Note what this does *not* change: the **topic gate is untouched**. Monitor
stores free text the learner typed; it never sends it to a model, so there is
nothing for the gate to judge. Applications widens what Hugh *holds*, not what
Hugh *teaches*. That distinction is the whole reason this is safe to ship.

### 2.4 Monitor takes the sixth home slot — approved
Cyan accent, bottom-right, filling the void the Systems card left. The grid
returns to a full 2 × 3. The stale `Systems` comment in `app/home/page.tsx`
gets corrected in the same pass.

---

## 3. Data model

Four new tables. RLS enabled on all four, every policy `user_id = auth.uid()`.
Migration 037 carries the three learner-authored tables; 038 added `effort` to
skill entries after Phase A shipped; `activity_events` is 044, with Phase C.

**Effort (added 2026-08-20, migration 038).** Each skill entry carries how
intensive that session was, 1 (subpar) to 5 (intensive), nullable. This changed
what a Monitor cell means: it shades by the day's **peak effort**, not by how
many sessions the day held. The grid answers "how hard did I go" rather than
"how often did I show up". Three easy sessions must not out-shade one hard one.
Unrated entries read as effort 1 — the lightest step, never invented upward.

### 3.1 `monitor_skills` — migration 037
```
id           uuid pk
user_id      uuid not null references auth.users
name         text not null
created_at   timestamptz default now()
archived_at  timestamptz     -- soft delete; a skill you stopped is history, not a mistake
```
Index on `(user_id, archived_at)`.

### 3.2 `monitor_skill_entries` — migration 037, `effort` added in 038
```
id          uuid pk
skill_id    uuid not null references monitor_skills on delete cascade
user_id     uuid not null   -- denormalised so RLS reads one table
entry_date  date not null
note        text
effort      smallint        -- 1-5, nullable; CHECK 1..5 (migration 038)
created_at  timestamptz default now()
```
Index on `(skill_id, entry_date)`.

**No unique constraint on `(skill_id, entry_date)`** — deliberate. Two sessions
on window functions in one day are two entries, each with its own effort, and
the cell keeps the harder of them. A unique constraint would force one of the
two sittings to be discarded or overwritten.

**`effort` is nullable and read as 1.** Entries written before 038 were bare
ticks, and there is no way to know retrospectively how hard they were.
Backfilling a number nobody entered would be the record inventing its own
contents, so NULL keeps meaning "not recorded" and shades at the lightest step.
That under-states old ticks — the acceptable direction for a record to be wrong.

### 3.3 `monitor_applications` — migration 037, history added in 039
```
id               uuid pk
user_id          uuid not null references auth.users
company          text not null
role_title       text not null
status           text not null    -- CHECK against the five statuses
applied_on       date not null
job_description  text
cover_letter     text
resume_text      text
notes            text
created_at       timestamptz default now()
updated_at       timestamptz default now()
```
Index on `(user_id, applied_on)`.

**Corrected in Phase B: status is a history, not a field.** This section
originally said only the current status would be stored, dismissing an events
table as "a funnel view nobody asked for". That was wrong, and the prototype had
already decided otherwise: *"A single mutable status column would erase the thing
you actually want later: how long each stage took, and where applications die."*

The concrete cost of getting this wrong: the Interviews tile would count only
applications sitting at interview **right now**, so the one number that measures
whether applying is working would fall every time an interview led to a
rejection. Migration 039 adds `monitor_application_events`.

The `status` column stays as the current stage — the list, the pills and the
chart all read it, and it carries the CHECK that keeps the five statuses closed.
Two places therefore hold status, which is a real drift risk, mitigated by
building both from one pure function (`statusChange`) applied by one route.
Nothing else writes either.

### 3.3b `monitor_application_events` — migration 039
```
id              uuid pk
application_id  uuid not null references monitor_applications on delete cascade
user_id         uuid not null   -- denormalised so RLS reads one table
status          text not null   -- CHECK against the five statuses
note            text            -- "30 min with the hiring manager"
occurred_on     date not null   -- when it happened, not when it was typed
created_at      timestamptz default now()
```

`occurred_on` is separate from `created_at` because you record on Thursday that
the rejection landed on Tuesday, and the timeline should say Tuesday.

The migration backfills one event per existing application from the status and
date already on the row. That invents nothing — both values are copied — and
without it an application would show a status above an empty timeline, which
reads as data loss.

### 3.4 `monitor_documents` + `monitor_document_versions` — migrations 040 and 041

Migration 037 put `resume_text` and `cover_letter` on the application itself.
That models a CV as a property of one application, which it is not: apply to
twenty jobs with the same résumé and the database holds twenty unrelated blobs
of text with no way to know they are the same document. The record therefore
could not answer the question a job search actually asks — *which résumé did I
send where, and did it work?*

```
monitor_documents
  id, user_id, kind ('resume'|'cover_letter'), label, created_at, archived_at

monitor_document_versions
  id, document_id, user_id, version int, content text, note text, created_at
  UNIQUE (document_id, version)

monitor_applications
  + resume_version_id       uuid  REFERENCES ... ON DELETE SET NULL
  + cover_letter_version_id uuid  REFERENCES ... ON DELETE SET NULL
  - resume_text, cover_letter   (migrated into documents, then dropped)
```

**What the reference buys**, and the reason the migration exists at all:

> `Analytics Engineer CV v3` — sent to 7, 2 reached interview.
> `v4` — sent to 11, 4 reached interview.

CV versions measured against outcomes. No AI, no inference — it falls out of the
join. Interviews are counted from the application **history**, so a version that
won an interview and was later rejected keeps the credit.

**ON DELETE SET NULL, emphatically not CASCADE.** Deleting a document must never
delete the applications sent with it. The application survives with an unknown
attachment — a gap in the record, where cascading would be a hole in it.

**A version's content is never editable.** An application claims to have sent a
particular version; rewriting it would make that claim false. To change the text
you add a version. `nextVersionNumber` takes one past the highest that exists
rather than `count + 1`, so a deleted version's number is never reused and "v3"
always means one specific text.

**The old columns are dropped, not kept.** Leaving them would give a CV two homes
that must agree — the exact failure this migration removes — and one would
silently go stale. `job_description` and `notes` stay on the application: they
belong to that one application and are never reused. Only things you send more
than once become documents.

**Files came next — see §3.5.** The text-first version shipped, and the file
followed once it was clear that a résumé is a laid-out artifact rather than its
words.

**On sensitivity.** A résumé is the most personal thing Hugh stores — address,
phone, full employment history. RLS is owner-only with no shared or
admin-readable path, and the admin console must never render document contents,
only counts.

### 3.5 Document files — migration 042

A résumé is not its words. It is a laid-out artifact, and the version you sent
was a PDF, not a transcription of one. So a version now carries the file too:
`file_path`, `file_name`, `file_size`, `mime` on
`monitor_document_versions`, plus a private `monitor-documents` Storage bucket.

**Text and file are both optional, but a version must have at least one.**
Enforced by a CHECK, not only in the route: "which version did I send" must
never resolve to an empty row. Keeping both is deliberate rather than redundant
— the text is searchable and readable inline, the file is the thing that was
actually sent.

**Storage follows the note-images pattern exactly.** Private bucket, objects
keyed `<user_id>/<document_id>/<uuid>.<ext>`, owner-only policies on the first
path segment, uploads through a service-role route so size and type are checked
server-side. The Storage key never reaches the browser.

**The stored extension comes from our allowlist, never from the filename.** The
browser-reported MIME type is a hint, not proof; deriving the extension from a
table we control means a mislabelled upload cannot name its own object on disk.
PDF, DOCX, DOC, RTF, ODT — an allowlist, never a blocklist.

**5 MB cap**, checked in the browser before upload and again on the server. Half
what Notes allows for screenshots, because there is no legitimate large case for
a CV.

**Signed URLs are minted per request and live five minutes.** Not attached to
the documents listing: most versions are never opened, and a list response
carrying a live URL to every résumé you have written is a far larger thing to
leak than one URL to the one you asked for.

**If the row insert fails after the upload, the object is removed.** Otherwise
the bucket accumulates bytes that no row can reach and no user can delete.

### 3.6 `activity_events` — migration 044
```
id          uuid pk
user_id     uuid not null references auth.users
feature     text not null   -- surface id from the registry, §4.2
event_date  date not null
hits        integer not null default 1
created_at  timestamptz default now()
UNIQUE (user_id, feature, event_date)
```

**This is not `usage_logs`, and the separation is load-bearing.**

`usage_logs` records token spend. Three surfaces spend nothing — The Case Room
and Case Lab are static JSON by design, and code drills run in Pyodide in the
browser. Built on `usage_logs` alone, their calendars would be permanently blank
no matter how heavily used: a view whose most visible content is a lie of
omission. Overloading `usage_logs` with page views would also corrupt the
per-row per-model cost maths that migration 036 just got right. `usage_logs`
stays a billing record.

They also speak different vocabularies, which is the second reason not to merge
them. `usage_logs.feature` holds 25 route-level strings (`learn/chat`,
`mastery/evaluate`, `tracker/points`, `tts`). `activity_events.feature` holds
~10 **surface**-level ids. A learner wants to know "did I use Ask Hugh today",
not "did `learn/summarize` fire".

Writes are **upsert-on-conflict, incrementing `hits`**: one row per user per
surface per day. A forty-message chat is one day of using Ask Hugh — but `hits`
still gives the ramp real gradation rather than a binary on/off.

---

## 4. Module structure

```
app/monitor/page.tsx                  # shell: header, tabs, view switch
app/api/monitor/
  skills/route.ts                     # GET list · POST create · PATCH archive
  skills/[id]/entries/route.ts        # GET · POST tick+note · DELETE
  applications/route.ts               # GET list · POST create
  applications/[id]/route.ts          # GET · PATCH · DELETE
  activity/route.ts                   # POST — client-only surfaces ping this (§4.3)
  usage/route.ts                      # GET — activity_events to per-surface heatmap days

components/monitor/
  MonitorShell.tsx                    # tab bar, URL sync, viewport lock
  SkillsView.tsx  SkillRow.tsx  SkillEntryForm.tsx
  ApplicationsView.tsx  ApplicationList.tsx  ApplicationDetail.tsx  ApplicationChart.tsx
  UsageView.tsx   UsageSurfaceCard.tsx

components/ui/CalendarHeatmap.tsx     # promoted from components/code/ProgressHeatmap.tsx

lib/monitor/
  features.ts     features.test.ts      # the surface registry
  applications.ts applications.test.ts  # statuses, validated palette, stacking, chart binning
  calendar.ts     calendar.test.ts      # rows to HeatmapDay[] bucketing
  activity.ts                           # server-only recordActivity()

hooks/useMonitor.ts                   # one hook owns the shell's state (Architecture Rule 2)
```

### 4.1 The heatmap is promoted, not duplicated
`components/code/ProgressHeatmap.tsx` already implements the emerald ramp, the
Sunday padding, the week columns and the no-streak copy. Monitor needs the same
thing three times over.

**Proposal: move it to `components/ui/CalendarHeatmap.tsx`**, add a `unit` prop
(`"check"` · `"session"` · `"visit"`) and an optional `cellSize`, and leave
`components/code/ProgressHeatmap.tsx` as a thin wrapper so `/code/start` is
untouched. Rejected: a second heatmap component under `components/monitor/`.
Two implementations of one ramp is exactly how the accent/ramp separation stated
in `components/code/GroupCell.tsx` starts to rot.

Day-bucketing moves to `lib/monitor/calendar.ts` as a pure function over
`{ date, count }` rows, so skill entries, application dates and activity events
all bucket through one tested path. `lib/code/progress.ts` keeps
`computePackProgress` and delegates its bucketing.

### 4.2 The surface registry
`lib/monitor/features.ts` exports one ordered array of surface ids with label,
route, icon and accent. The Usage view iterates the registry — it never
hardcodes a list. Adding a surface to Hugh means adding one entry here and one
`recordActivity` call, and a test asserts the two sets match, so a surface
cannot be instrumented without appearing, or appear without being instrumented.

Initial set (10): `learn` · `ask` · `review` · `mastery` · `code-drill` ·
`code-sandbox` · `cases` · `case-lab` · `cloud` · `notes`. The legacy
`/interview` loop is deliberately excluded — it is not on `/home`, and Monitor
should not resurrect it as a visible surface.

### 4.3 Instrumentation — the honest cost
Monitor is not one page. It is one page plus instrumenting ten surfaces.

Two seams:
- **Server** — surfaces that already hit an API route call
  `recordActivity(userId, feature)` from `lib/monitor/activity.ts`
  (`import "server-only"`), alongside the existing `logUsage` call where there
  is one. Covers learn, ask, review, mastery, cloud, notes, code-sandbox chat.
- **Client** — surfaces that spend nothing and call no route (cases, case-lab,
  code-drill) `POST /api/monitor/activity` once on mount, guarded by a
  `sessionStorage` key per feature per day so a browsing session fires once.

`recordActivity` **never throws into the caller**. A failed activity write must
not break a learning session; it logs and returns. This is the one place in Hugh
where swallowing an error is correct, and the code will say why in a comment.

### 4.4 Application statuses live in a tested module
`lib/monitor/applications.ts` owns the five statuses, their validated hex
values, and the stacking order — with a unit test that asserts the order
literally.

```
Rejected #e66767 · Applied #3987e5 · Screening #d95926 ·
Interview #9085e9 · Offer #199e70
```

The palette passes all six dataviz checks on a dark surface **only in that
stacking order**: green above red fails deutan separation at ΔE 4.6. A comment
alone would eventually get "tidied" by a later reader; a failing test explains
itself.

---

## 5. Documentation deliverables

Shipped in the same pass as Phase A, not after:

1. **`CLAUDE.md` Rule 4** — extend the Notes scroll exception to Monitor, with
   the reason (records tools, not teaching surfaces) and the same "panes scroll
   internally, the page does not" wording.
2. **`CLAUDE.md` surface table** — add the `/monitor` row.
3. **`CLAUDE.md` folder structure** — add `lib/monitor/`.
4. **`CLAUDE.md` usage/cost section** — one line stating that `activity_events`
   is not `usage_logs`, and why, so the next reader doesn't merge them.
5. **`PROJECT_LOG.md`** — an entry per phase.

---

## 6. Build phases

Each phase ends green: `npm run lint`, `tsc`, the full Vitest suite, and a
production build.

**Phase A — shell, Skills, home card, docs**
Migration 037. `/monitor` shell with three tabs (Applications and Usage present
but empty-stated). Skills end to end. `CalendarHeatmap` promotion plus
`lib/monitor/calendar.ts` with tests. Home card in the sixth slot, cyan. All
five documentation deliverables.
*Reviewable as: add a skill, tick three days, see the heatmap.*

**Phase B — Applications**
List ↔ full-width detail. The five fields. Stacked daily chart driven by
`lib/monitor/applications.ts`, with the palette-order test. Subheading copy per
§2.3.
*Reviewable as: record an application, reopen it, watch the chart move.*

**Phase C — Usage** — planned in detail in §8 below.

Phase C is the largest and touches the most existing files. It is last on
purpose: A and B are self-contained and can ship without it, and Usage is the
only view whose value depends on data accumulating over days rather than being
visible the moment you type it in.

---

## 7. Risks and trade-offs

**Instrumentation reaches into ten live surfaces.** Every `recordActivity` call
is a line added to a route that currently works. Mitigated by the call never
throwing, and by Phase C being separable — if it goes badly it can be reverted
without touching Skills or Applications.

**UTC day bucketing.** Days are bucketed in UTC, server-side, with no access to
the learner's timezone. A late-night session can land on the next day's cell.
This is the same imprecision `lib/code/progress.ts` already accepts and that
GitHub's own contribution graph has. Accepted, not fixed — noted here so it
isn't rediscovered later as a bug.

**Free-text skills will drift from tracks.** A learner may track "dbt
incremental models" in Monitor while their Hugh track covers something else.
That is the intended design — Monitor records what you did, not what Hugh
assigned — but it means Skills and `learning_goals` will show different pictures
and neither is wrong.

**Applications changes what Hugh is.** Recorded in §2.3 and decided. The scope
boundary to hold: Monitor may *hold* career-admin data; no Hugh surface may
*teach* against it. The moment something wants to generate a cover letter, that
is a new product decision, not an extension of this one.

---

## 8. Phase C — Usage: the plan

Written 2026-08-20, after Phases A and B shipped. Two findings in the codebase
change this from what §3.6 and §6 originally described, and both are corrections
rather than refinements.

### 8.1 One seam, not two — a correction

The original plan instrumented **server routes** where one already existed and
fell back to a client ping only for the three surfaces that spend no tokens.
That is wrong, and wrong in the specific way this whole table exists to avoid.

An API route records **where you spent tokens**, not **where you showed up**.
Browsing `/cloud` without asking the assistant anything, reading a Notes page
without invoking the Coach, or opening a track board without generating
anything all hit no instrumented route — so they would record nothing, and their
calendars would under-report exactly like `usage_logs` does. Half the surfaces
would have been quietly lying.

**So: one client seam, uniformly.** A small client component mounted on each
surface page pings once per feature per day. That is simpler, more correct, and
removes the largest risk in §7 — it no longer edits ten live API routes.

```tsx
// On each surface page, one line:
<RecordActivity feature="notes" />
```

The ping is guarded by a `sessionStorage` key (`monitor:notes:2026-08-20`) so a
browsing session fires once, and by the unique constraint plus `hits` counter in
the database so a duplicate is an increment rather than a row.

A page visit therefore counts as usage. That is intended: opening Notes and
reading is using Notes, and the question the grid answers is "did I show up".

### 8.2 Most calendars do not start empty

Eight of the ten surfaces already have dated rows in the database. Seeding from
them means the view is useful the day it ships instead of in three months.

| Surface | id | Seeded from |
|---|---|---|
| Learn — track board | `learn` | `usage_logs` `tracker/*`, `dashboard/*` |
| Ask Hugh | `ask` | `usage_logs` `learn/*`, `milestone_entries` |
| Review quiz | `review` | `usage_logs` `review/*` |
| Prove mastery | `mastery` | `usage_logs` `mastery/*` |
| Code drills | `code-drill` | `code_drill_attempts`, `usage_logs code/generate-drill` |
| Code sandbox | `code-sandbox` | `usage_logs` `code/chat` (chat only) |
| The Case Room | `cases` | `case_attempts` |
| Case Lab | `case-lab` | **nothing — genuinely starts empty** |
| Cloud reference | `cloud` | `usage_logs` `cloud/*` (chat only) |
| Notes | `notes` | `usage_logs` `notes/*`, `note_images`, `note_messages` |

`interview/*` and `tts` rows are **excluded**: the interview loop is legacy and
not on `/home`, and Monitor should not resurrect it as a visible surface. `tts`
cannot be attributed to one surface anyway.

The seeded rows are honest but partial, and the view will say so: for `cloud`
and `code-sandbox` the history covers only the days you used their chat, and
Case Lab has no history at all. A one-line note under the grid beats a silent
under-count.

**This does not contradict §3.4.** `usage_logs` still cannot *be* the Usage view
— it misses Case Lab entirely and under-reports the rest. It can seed one, once,
with its limits stated.

### 8.3 The prototype's open question, answered by the above

The prototype asked: ship with the uninstrumented calendars visibly empty and
labelled, or instrument everything first? It recommended instrumenting first,
"because a view whose main content is *coming soon* teaches nothing".

With a single seam the instrumentation is one line per page, so there is no
reason to ship partially. **Instrument all ten, seed eight, and label the gaps.**

### 8.4 Data model — migration 044

```
activity_events
  id          uuid pk
  user_id     uuid not null references auth.users
  feature     text not null      -- surface id from the registry
  event_date  date not null
  hits        integer not null default 1
  created_at  timestamptz default now()
  UNIQUE (user_id, feature, event_date)
```
Index on `(user_id, feature, event_date)` — served by the unique constraint.
RLS owner-only, matching every other Monitor table.

Writes are `ON CONFLICT … DO UPDATE SET hits = hits + 1`: one row per user per
surface per day, but `hits` still gives the ramp real gradation instead of a
binary on/off.

The migration ends with the seeding inserts from §8.2, each `ON CONFLICT DO
NOTHING` so re-running is harmless.

### 8.5 Modules

```
app/monitor/…                          (no new route — a view inside the shell)
app/api/monitor/activity/route.ts      # POST ping · GET the grid
components/monitor/UsageView.tsx
components/monitor/RecordActivity.tsx  # the one-line client pinger
lib/monitor/features.ts  features.test.ts   # the surface registry (pure)
```

**The registry is the single source of truth.** `lib/monitor/features.ts` holds
one ordered array — id, label, route, icon — and the Usage view iterates it.
A test asserts that every id used by a `RecordActivity` call appears in the
registry and vice versa, so a surface cannot be instrumented without appearing,
or appear without being instrumented.

### 8.6 The view

Following the prototype: a wide left pane with one combined **Everything**
heatmap over 12 months, then a grid of small per-surface calendars; a narrow
right pane ranking surfaces by days used, and the note about where the data
came from.

Twelve months, not the 182 days Skills uses — the point of this view is the
gaps, and "Case Lab opened twice in six months" needs six months on screen. Cell
size drops to 7px to fit; the shared `CalendarHeatmap` already takes `cellSize`.

The **relative** ramp, not `absolute5`: a hit count has no fixed scale, so it
shades against the busiest day like `/code/start` does.

### 8.7 Risks

**A page visit is a low bar.** Opening a surface and immediately leaving counts.
Accepted: the alternative is a dwell timer, which is both fiddly and a different
question from "did I show up".

**Seeded history has a visible seam.** Days before the migration reflect token
spend or attempts; days after reflect visits. The counts are not comparable
across that line. The view will mark the seam date rather than pretend the
series is uniform.

**Ten pages get one line each.** Small, but it is ten files. Mitigated by the
component doing nothing but a guarded POST, and by failure being silent by
design — a failed activity write must never break a learning session.
