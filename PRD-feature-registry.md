# PRD — Feature Registry and the Operator's Console

Status: SHIPPED — all four stages, 2026-09-07
Date: 2026-09-07
Supersedes nothing. Extends PRD-observability.md.

---

## 1. Why this exists

The owner asked whether Hugh's features should be split into separate work
folders with a master folder on top, for easier administration and better
visibility.

They should not, and the measurement says why. Across the 16 feature modules in
`lib/`, there are **two feature-to-feature import edges in total** —
`tracker → learn`, because track generation runs the topic gate before it
spends, and `code → case-lab`, because the notebook reuses the Pyodide session
client. In `components/` there are five. Everything else each feature touches is
shared infrastructure. The features are already decoupled; the decoupling is
simply expressed as folders inside one project rather than as separate projects.

(An earlier count in this document said nine. That was wrong: it counted
features importing `lib/observability`, which is infrastructure every feature
may use freely, not a dependency between features.)

Splitting them physically would cost the single deploy, the single login session
and the single database, and would buy nothing on the coupling axis, because the
coupling being solved for is already near zero.

**The real gap is not structural. It is that Hugh has no feature axis.**

## 2. The three findings this responds to

**F1 — Fourteen of eighteen money-spending routes report no outcome.**
Eighteen API routes call `logUsage`. Exactly four of them call `recordOperation`:
`dashboard/goals`, `learn/chat`, `tracker/mastery/evaluate` and
`tracker/review/quiz`. The other fourteen spend money and record nothing about
whether the spend succeeded.

An earlier count of this gap said eleven. That was wrong: it credited three
routes — `dashboard/refine`, `dashboard/goals/document/extract` and
`tracker/milestones/[id]/coverage` — that import `logSafeError` but never write
to `operation_events`. Sanitized error logging goes to the console; it is not
the outcomes store, and a route holding only the former is invisible to
`/admin/observability`.

Rolled up to whole surfaces, the same gap reads **four of eight spending
features instrumented**, with Code, Cloud, Notes and Voice entirely blind. That
figure is now printed by the test suite on every run, so it is checkable rather
than asserted.

**F2 — The admin console has no feature dimension.**
Every figure on `/admin` is grouped by user or by model. The page can answer
"what did this learner spend?" and "what did Haiku cost?" It cannot answer "how
is Cases doing?", because no query on that page groups by feature.

**F3 — The three stores cannot be joined.**
`usage_logs.feature` is route-level (23 distinct strings). `activity_events.feature`
is surface-level. `operation_events.operation` is operation-level. These
vocabularies are deliberately different and must stay different — that is settled
in CLAUDE.md and is correct. But nothing maps between them, so no view can put
spend, engagement and outcome for one feature side by side.

## 3. Goal

One page the owner opens to see the true state of every feature in Hugh: whether
it works, what it costs, whether anyone uses it, whether it is tested, and
whether it is instrumented at all.

## 4. Users

One: the owner, who is not a software engineer and is preparing to launch in
January. Every element must be legible without reading code.

## 5. Core features

### 5.1 The Feature Registry — `lib/registry/features.ts`

One pure, tested module declaring every surface in Hugh. Per surface:

- `id` and `label` — stable key, human name
- `routes` — the pages a learner can reach
- `apiRoutes` — the API paths it owns
- `libDir` / `componentsDir` — where its code lives
- `tables` — the database tables it reads and writes
- `usageFeatures` — the `usage_logs.feature` strings that belong to it
- `activityFeature` — its `activity_events.feature` value, or null
- `operations` — the `OperationId`s it owns, or an empty list
- `spendsTokens` — whether it can cost money at all
- `status` — `live` | `beta` | `internal`

This is the join key of finding F3. It is the "master folder that sits on top",
expressed as data rather than as directories.

It follows the precedent of `lib/observability/operations.ts`: a registry is a
TypeScript change, deliberately not a migration, so an orphaned entry renders
nowhere instead of corrupting a view.

### 5.2 The drift guard — `lib/registry/features.test.ts`

A registry that can go stale is just another of the seventeen markdown files in
this repo's root. This one cannot go stale, because CI fails when it does. The
test asserts:

1. Every directory under `lib/` and `components/` appears in exactly one feature
   (or on an explicit infrastructure allowlist).
2. Every `route.ts` under `app/api/` is claimed by exactly one feature.
3. Every `feature:` string passed to `logUsage` appears in some `usageFeatures`.
4. Every `OperationId` in the operations registry is claimed by one feature.
5. Every feature marked `spendsTokens: false` owns no route that calls `logUsage`.

Assertion 5 is the machine-checked form of an existing hard rule: the margin
spends no tokens. That rule is currently held by a comment.

### 5.3 The boundary guard — same test file

A feature module may import from infrastructure (`supabase`, `auth`, `usage`,
`observability`, `errors`, `pricing`, `claude`, `types`) and from nothing else,
except along edges listed explicitly in an `ALLOWED_EDGES` constant. Today that
list holds the nine real edges. Adding a tenth becomes a deliberate act with a
reason beside it, rather than something that happens by accident at 1am.

This delivers the only real benefit of separate repositories — enforced
boundaries — without the deployment machinery.

### 5.4 The Feature Health page — `/admin/features`

One row per feature, reading the registry and joining the three stores across a
selectable window (7d / 30d / all):

| Column | Source | Answers |
|---|---|---|
| Feature | registry | which surface |
| Health | `operation_events` | ok / failed / refused counts |
| Spend | `usage_logs` via `usageFeatures` | per-row, per-model cost |
| Use | `activity_events` | distinct learners, days active |
| Tests | filesystem count | is it covered |
| Instrumented | registry | can this page even see it |

**The Instrumented column is the design's spine.** A feature that spends money
but records no operations renders as `not instrumented` — visibly distinct from
`healthy`. This is CLAUDE.md Rule 5 applied to the console itself: a blank must
never be readable as a pass. It also means the page is its own punch-list for
January, and closing F1 shows up as visible progress on the page.

### 5.5 Admin restructure

`/admin` becomes the operator's console with the feature table as its headline.
Existing content is preserved, not deleted:

- Feature health table — new, top
- Provider status (ElevenLabs, Anthropic) — kept as-is
- Users and approvals — moved to `/admin/users`, unchanged
- `/admin/observability` — kept, unchanged; it is operation-centric and
  track-centric, and the new page is feature-centric. They do not overlap.

## 6. Out of scope

- Splitting the repository, npm workspaces, Turborepo, or any multi-deploy shape
- Any change to feature behaviour — this project adds visibility, not features
- Alerting, paging, or anything that sends a message
- New database tables. Migration count stays at 50. All three stores exist.
- Merging or re-vocabularising the three stores

## 7. Success criteria

1. `npm run test` fails if a new API route, feature folder, or `logUsage` feature
   string is added without a registry entry.
2. `npm run test` fails if one feature imports another outside `ALLOWED_EDGES`.
3. Zero routes report `not instrumented` on `/admin/features` by launch.
4. The owner can answer "is Notes healthy, and what did it cost this month?"
   in one page load, without reading code.
5. No new `any`. No new migration. No scroll on the page.

## 8. Risks and trade-offs

**The registry adds a step to adding a feature.** Deliberate: the drift guard is
the whole point, and it converts a silent omission into a failed build with a
message saying what to add.

**The health page reads three stores per load.** Grouped aggregates over a
windowed range, admin-only, few users. If it slows down later, a materialised
rollup is the answer — but not before it is measurably slow.

**Test count is a weak proxy for quality.** Shown as a number with no judgement
attached, next to health, which is the real signal. Coverage is presently lopsided
— `code` has 9 test files, `cases`, `case-lab`, `cloud` and `margin` have 1 each.
Making that visible is the point.

## 9. Build order and rationale

1. **Registry + drift guard + boundary guard.** Pure data and tests; touches no
   running code; risk near zero. Everything else reads it.
2. **Feature Health page.** Built before F1 is closed, so `not instrumented`
   renders honestly and the page becomes the punch-list.
3. **Close the 11 uninstrumented routes.** Progress is visible on the page as it
   happens.
4. **Admin restructure.** Last, once there is something worth making the headline.

Each stage ships green and is independently useful. Stopping after any stage
leaves Hugh better than it started, which matters with a January date.
