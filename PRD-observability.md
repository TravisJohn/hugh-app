# PRD — Operational observability

Status: **proposed, awaiting approval.** No code written.
Scope of v1: the Learn loop. Designed to extend to every other surface.

---

## 1. Goal

Answer questions about whether Hugh's features are *working*, from inside
Hugh — not by reading ephemeral platform logs.

The Learn loop was fortified on 2026-08-24: failures are now honest
(`track_status: 'failed'`, `TrackGenerationError`, a real retry). But nothing
is *told*. These questions currently have no answer:

- How many track builds failed this week, and from which cause?
- How long does a build actually take? The "30–90s" in the code comments is
  folklore. `maxDuration = 120` and `STALL_MS = 5 min` are guesses resting on it.
- How often is Rebuild pressed, and does it succeed the second time?
- **How often did the domain gate fail open?** `judgeTopicDomain` returns
  `reason: "classifier-unavailable"` and lets the topic through. A broken
  classifier is currently indistinguishable from a working one.
- How often does a build die without ever writing a status — the `after()`
  invocation killed mid-flight?

## 2. Users

The **operator** (Travis), via `/admin`. Not learners. This is data about the
system, not about the person using it — which is what separates it from
`/monitor`, where every row belongs to the learner who made it.

## 3. What exists, and why this is a third thing

| Store | Records | Grain |
|---|---|---|
| `usage_logs` | token spend, priced per row per model | one row per API call |
| `activity_events` | engagement — "did the learner show up" | one row per learner per surface **per day**, deduped |
| **`operation_events`** *(new)* | **outcomes** — did it work, how long, why not | one row per **attempt** |

Neither existing table can absorb this:

- `usage_logs` is priced per row. Non-spend rows would corrupt the cost maths
  migration 036 got right (CLAUDE.md, usage accounting).
- `activity_events` is deduped to one row per day by a unique constraint. It
  structurally cannot hold per-attempt outcomes, and three surfaces that spend
  nothing depend on that shape.

The same rule that keeps those two apart keeps this one separate: they answer
different questions and neither can carry the other's data model.

## 4. Core features (v1)

1. **`operation_events` table** (migration 047) — one row per attempt.
2. **An operation registry** — the vocabulary, in TypeScript, extensible
   without a migration.
3. **`recordOperation()`** — the server-side writer.
4. **Instrumentation of the Learn loop** — the points listed in §7.
5. **A client beacon** — the only way to see a build that died silently.
6. **An Operations panel in `/admin`** — rates, durations, top error classes.

## 5. Out of scope for v1

- **Alerting.** You cannot set an accurate threshold before collecting a
  baseline. Revisit once there is a month of data.
- **Retention / pruning.** Volume is low (see §9). Revisit at volume.
- **Every other surface.** Code, Cases, Cloud, Notes, Monitor come after the
  vocabulary is proven on one loop.
- **Learner-visible reliability data.** Operator-only.
- **Distributed tracing, spans, third-party APM.** No new dependencies.

## 6. Success criteria

1. Every failure path added in `f540684` produces a row.
2. `/admin` answers all five questions in §1 without a SQL console.
3. A build killed mid-`after()` is visibly distinct from one that failed
   cleanly, and from one still running.
4. A refused request never counts as a failure (see §8.1).
5. No learner prompt text, topic text, or diary content reaches the table.
6. Observability failing never fails the thing it observes.

---

## 7. Architecture

### 7.1 Schema — migration 047

```sql
CREATE TABLE IF NOT EXISTS operation_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- An id from the registry in lib/observability/operations.ts. Deliberately
  -- NOT a CHECK constraint, for the same reason activity_events.feature is not:
  -- adding an operation should be a TypeScript change, not a migration. An
  -- unknown id renders nowhere, because the panel iterates the registry.
  operation   TEXT        NOT NULL,

  -- 'ok' | 'failed' | 'refused'. Three values, not two — see §8.1.
  outcome     TEXT        NOT NULL,

  duration_ms INTEGER,
  error_class TEXT,
  error_note  TEXT,     -- sanitised + truncated. Never a prompt. See §8.2.
  detail      JSONB     -- bounded: numbers, booleans, enum-ish strings only.
);

CREATE INDEX IF NOT EXISTS operation_events_op_created
  ON operation_events (operation, created_at DESC);

ALTER TABLE operation_events ENABLE ROW LEVEL SECURITY;
-- No user-facing policy: this is operator data. Only the service role
-- (which bypasses RLS) writes it, and only /admin reads it.
```

`user_id` is kept because "did this fail for everyone or one account" is a
question worth answering, and `ON DELETE CASCADE` means a deleted account takes
its rows with it.

### 7.2 Module structure

```
lib/observability/
  operations.ts        # registry (pure) — ids, labels, client-reportable flag
  operations.test.ts   # registry <-> instrumented set must match
  sanitize.ts          # pure — truncate, redact known learner strings
  sanitize.test.ts
  rollup.ts            # pure — rows -> per-operation stats, p50/p95
  rollup.test.ts
  record.ts            # server-only — recordOperation(); swallows its own errors

app/api/observability/beacon/route.ts   # the client's only way in
components/admin/OperationsPanel.tsx    # the read view
supabase/migrations/047_operation_events.sql
```

`record.ts` mirrors `logUsage`'s call shape so it reads as a sibling, not a new
idiom:

```ts
await recordOperation({
  userId,
  operation:  "track.build",
  outcome:    "failed",
  durationMs: Date.now() - startedAt,
  errorClass: "TrackGenerationError",
  errorNote:  sanitize(err, [topic]),
  detail:     { source: "qa", attempt: 1 },
});
```

### 7.3 The registry

Mirrors `lib/monitor/features.ts`, including its test invariant: an operation
cannot be instrumented without appearing in the registry, or appear without
being instrumented.

| id | Where |
|---|---|
| `track.build` | `dashboard/goals`, `goals/document/approve` |
| `track.retry` | `goals/[id]/retry` |
| `topic.gate` | `lib/learn/topic-domain-server.ts` |
| `quiz.generate` | `tracker/review/quiz` |
| `mastery.evaluate` | `tracker/mastery/evaluate` |
| `ask.chat` | `learn/chat` |

Ids are `domain.action`. The domain prefix is what lets this extend to
`code.drill`, `notes.coach`, `cases.score` without renaming anything.

### 7.4 Instrumentation points

**Track build** — inside the existing `after()` blocks, both branches:

- `dashboard/goals/route.ts` → `track.build`, `detail: { source: "qa" }`
- `goals/document/approve/route.ts` → `track.build`, `detail: { source: "document" }`
- `goals/[id]/retry/route.ts` → `track.retry`, plus a `refused` row at each of
  the three 409 verdicts (`still-building`, `needs-approval`, `nothing-wrong`)

Duration is measured in the `after()` block, which is the only place that knows
when generation actually started and stopped.

**The gate that fails open** — `judgeTopicDomain` writes `topic.gate` with:

| Verdict | outcome | error_class |
|---|---|---|
| in domain | `ok` | — |
| off domain | `refused` | — |
| classifier unavailable (fails open) | `failed` | `classifier-unavailable` |

This is the single highest-value row in the design: it is the only way to learn
that the gate has silently stopped gating.

**The rest of the loop** — `quiz.generate`, `mastery.evaluate`, `ask.chat`
record `ok`/`failed` around their existing try/catch, and `refused` where
`enforceUsageGate` returns non-null.

### 7.5 The client beacon

`useTrackStatusWatch` has a 180s hard timeout. When it fires, the build wrote
no status at all — the strongest evidence that `after()` was killed. Only the
browser knows this happened.

The hook gains a beacon on the **timeout path only** (not the server-reported
`failed` path, which is already recorded server-side), posting to
`/api/observability/beacon`.

The beacon route is deliberately narrow, because it is a client-writable path
into a system table:

- authenticated;
- accepts only operations flagged `clientReportable` in the registry;
- accepts only `outcome: "failed"` with `errorClass: "client-timeout"`;
- verifies the referenced goal belongs to the caller;
- no `errorNote`, no `detail` free text.

It is a fixed-shape signal, not a logging endpoint.

### 7.6 The read view

An **Operations** panel on `/admin`, rendering per operation over a chosen
window: attempts, ok / failed / refused, failure rate, p50 and p95 duration,
and the top error classes. All aggregation lives in `lib/observability/rollup.ts`
— pure and unit-tested per Architecture Rule 7 — so the panel only formats.

---

## 8. Key decisions

### 8.1 `outcome` has three values, not two

A usage-gate block, an off-domain topic, a 409 "still building" — these are the
system working correctly. Folding them into `failed` would make a healthy
product look broken and send you chasing noise. `refused` is the load-bearing
value in this schema.

### 8.2 Privacy: never the prompt

`error_note` is produced by a pure `sanitize(err, redact: string[])` that:

1. takes the error's message,
2. redacts any known learner-supplied string passed in (the topic, the
   milestone title) — replaced with `[redacted]`,
3. truncates to 200 characters.

Redaction is explicit rather than pattern-matched, because the caller is the
only thing that reliably knows which strings came from the learner. Parse
errors can echo model output and Postgres errors can echo row values, so
truncation alone is not enough.

`detail` is guarded at runtime: `recordOperation` rejects any string value over
40 characters, so free text cannot arrive through the side door. Numbers,
booleans and short enum-ish strings only.

### 8.3 Observability must never break what it observes

`recordOperation` swallows its own errors and falls back to `console.error`.
This is the exact inversion of the rule enforced across the Learn loop in
`f540684`, and the one place it is correct: a telemetry write failing must not
fail a learner's track build. Written down here so nobody later "fixes" it.

### 8.4 Registry over enum-in-the-database

Same reasoning as `activity_events.feature`: adding an operation should be a
TypeScript change, not a migration. The panel iterates the registry, so an
orphaned id renders nowhere rather than corrupting a view.

---

## 9. Risks and open questions

- **Volume.** Everything except `ask.chat` is single-digit rows per learner per
  day. `ask.chat` is one row per message and will dominate the table. It is
  still small in absolute terms, and it is where failures are most visible to
  learners — but if it proves noisy, it is the first candidate to drop.
- **`after()` cannot be trusted to record its own death.** That is precisely
  why §7.5 exists. If both the server row and the beacon are missing, the
  attempt is invisible — the panel should therefore compare build attempts
  against `learning_goals` rows created, and report the gap.
- **Migration 047 needs manual apply**, like every migration here.
- **This is not error monitoring.** It records that an operation failed and its
  class, not a stack trace. If you later want stack traces, that is a Sentry
  decision, not an extension of this table.
