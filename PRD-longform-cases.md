# PRD — Long-Form Data Cases ("The Case Lab", working title)
**Version**: 0.1
**Status**: Draft — awaiting approval (no code yet)
**Builds on**: The Case Room (Phase 26) — this is a *sibling* engine, not an extension
**Focus**: A second, long-form mode inside `/cases`: a real business problem + a
synthetic dataset the learner actually analyses, graded deterministically.

---

## 1. Problem / Goal

The Case Room's multiple-choice cases are excellent for *quick* judgment reps
(10–15 min, zero data work). They can't test the thing that actually breaks in
the field: **can you take a messy dataset, resist the obvious-but-wrong reading,
and defend a real recommendation?**

**Goal:** a long-form case mode where the learner is handed a business question
and a 10,000+ row dataset, does genuine analysis in-browser, is guided through
checkpoints, and submits a written recommendation — all graded deterministically
against a *known* ground truth, with AI used only for a final memo critique and
optional hints.

---

## 2. Users

The existing Hugh learner (data / analytics skill prep). Same auth gate, same
"data & analytics only" domain. Long-form suits the learner who has done a few
MC cases and wants to *apply* judgment on real data, not just recognise it.

---

## 3. Core concept — one case, end to end

1. **Brief** — a business scenario + the stakeholder's confident (wrong) belief +
   the question. E.g. *"Marketing swears the Q3 win-back email lifted retention.
   Fund it next quarter?"*
2. **Dataset** — a 10k+ row CSV, pre-loaded into a pandas DataFrame in the
   in-browser **Pyodide** workbench. The learner explores freely in Python.
3. **Guided checkpoints** — a fixed spine of prompts that walk the analysis
   (compute the naive effect → notice who was treated → identify the confounder →
   estimate the adjusted effect). Each checkpoint is graded the instant it's
   submitted.
4. **Written recommendation** — a short analyst memo to the stakeholder.
5. **Result** — a **gap score** (how far the learner's outputs sit from the band
   of correct outputs — like strokes over par) + a **memo score** (LLM rubric),
   with qualitative feedback and the planted insight revealed.

**Why "both" (checkpoints + memo):** the gap score grades *"did you get the right
answer,"* the memo grades *"do you understand why."* Each covers the other's
failure mode (fluking a close number; writing a lovely memo around a wrong one).

---

## 4. The keystone idea: the LLM never emits 10,000 rows

The LLM authors a small **data-generating process (DGP) script** (numpy/pandas)
that *plants the lesson* — a confounder, a Simpson's split, a survivorship gate.
Code runs the script to emit the CSV. This buys us, deterministically:

- **10k+ reproducible rows** from a seed, cheaply;
- a **known ground truth** (the true parameter is a DGP input), which is what
  makes an open-ended case gradeable **without an LLM judge** on the analysis.

---

## 5. Scope — the pilot (5 inference cases)

Inference-first (causal-caution) — the highest-judgment territory, and a
non-arbitrary set: the five classic ways a confident wrong conclusion gets made.
Each is a distinct DGP archetype, so the pilot **also seeds the reusable template
library**. In every one, the naive answer is inflated and the honest answer is
small.

| # | Trap | Case (the confident wrong belief) | Planted structure |
|---|---|---|---|
| 1 | Confounding / selection bias | "The Q3 win-back email lifted retention — fund it." | Campaign went to already-engaged users |
| 2 | Simpson's paradox | "New checkout converts *worse* overall — roll it back." | Reverses once split by device/segment mix |
| 3 | Regression to the mean | "We coached our worst reps and they improved." | Worst performers regress up anyway; true effect ≈ 0 |
| 4 | Survivorship bias | "Feature-X users churn less — push everyone to X." | Only long-survived accounts *can* use X |
| 5 | Seasonality confound | "Revenue jumped after the Nov loyalty launch." | November always spikes; incremental effect tiny |

### Worked example — Case #1 checkpoint spine (canonical)

Dataset columns (illustrative): `user_id, signup_date, plan_tier, region,
engagement_score, got_campaign, retained_90d`.

| CP | Prompt | Kind | Graded against (from sealed key) |
|----|--------|------|----------------------------------|
| 1 | "Naive 90-day retention: campaigned vs not?" | numeric | band from DGP resample of the raw difference |
| 2 | "Before concluding — who actually got the campaign?" | mcq | correct = "already-engaged users" |
| 3 | "Which variable confounds the comparison?" | mcq | correct = `engagement_score` |
| 4 | "Estimate the *adjusted* retention effect." | numeric | band = sampling CI of the true planted effect (~small) |
| 5 | Memo: "Write your recommendation to the VP." | memo | LLM rubric (see §7.4) |

---

## 6. Out of scope (pilot)

- **Prediction / Kaggle-style cases** (held-out-metric grading) — planned v2.
- **Leaderboards, streaks, daily-commit mechanics** — the feed will *feel* daily
  but we do **not** lock a daily SLA in the pilot (see §7.7).
- **Multiplayer / sharing / public profiles.**
- **Mobile layout** (consistent with existing Hugh deferral).
- More than the 5 archetypes above.

---

## 7. Architecture

### 7.1 A sibling engine, not an extension
Do **not** reuse the Case Room's `Decision`/`CaseOption` multiple-choice model —
wrong shape for open-ended analysis. New types, new player, new routes, its own
manifest. It sits behind a **second tab in `/cases`**.

### 7.2 Two-tier data model (the one real divergence from the Case Room)
The Case Room is *all-public* (everything under `public/case-data/`, graded
client-side, zero AI). Long-form **cannot** be — a public answer key is a
fetchable answer key. Every case therefore has two visibility tiers:

- **Public** (shipped to the learner): `case.json` (scenario, data schema,
  checkpoint *prompts*, memo task) + `data.csv` (the rows). CDN-able.
- **Sealed** (server-side only, never sent to the client): `key.json` (checkpoint
  answer bands, MCQ correct answers, memo rubric), plus the `dgp.py` and
  `solution.py` authoring artifacts. Private bucket / repo — never CDN.

Consequences:
1. **Grading is an API route** (`/api/cases/lab/grade`) that reads the sealed key
   server-side. No client-side deterministic grading for these.
2. **The GCS swap seam splits**: public artifacts follow the existing
   `lib/cases/loader.ts` seam; the sealed tier gets its own private loader.

### 7.3 Workbench — Pyodide (already in the repo)
Reuse the existing Pyodide worker (`lib/code/pyodide.worker.ts`,
`app/code/page.tsx`). The CSV is pre-loaded into a DataFrame; the learner writes
pandas/numpy. **Zero backend compute** — it's the learner's own CPU. A 10k-row
CSV is ~1 MB and loads fine.

### 7.4 Grading contract
**Checkpoints (deterministic, server-side, no AI):**
- `mcq` → exact match to the sealed correct id.
- `numeric` → inside the sealed **band** (derived from a DGP resample, so any
  *valid method* lands in-band; a naive/confounded answer falls far outside).
- `direction` → sign / rough-magnitude bucket (most method-robust).
- Design rule: **lean on `mcq`/`direction`; reserve exact `numeric` for
  quantities with one answer regardless of method** (e.g. group sizes). This is
  the mitigation for the "multiple valid methods" grading risk.
- The per-case **gap score** aggregates checkpoint distances into one number
  (strokes-over-par), mirroring the Case Room's "counterfactual diff vs gold."

**Memo (LLM rubric — the only guaranteed runtime AI):**
- One Sonnet call. Rubric in the sealed key: weighted criteria + `mustMention`
  (e.g. names the confounder; caveats causality; states a decision). Returns a
  score + short feedback.

**Result** = gap score + memo score → overall, plus feedback + planted insight.

### 7.5 Guided instruction
Deterministic checkpoint spine drives the case. An **optional** "I'm stuck" nudge
calls a cached AI hint (`/api/cases/lab/nudge`) — the brief + schema sit in a
cached prefix, so hints are cheap and only fire on demand. Haiku-class.

### 7.6 Runtime cost (bounded, flat per-session)
Pyodide free · checkpoint grading free · **1 Sonnet memo call per completion** ·
optional cached hints. Cost does **not** scale with user count in any scary way.
This breaks the Case Room's zero-runtime-AI property but stays small and capped.

### 7.7 Delivery — a dated "file-explorer" feed
A new landing for long-form: a **dated feed** (date · problem · trap/difficulty ·
your gap-score · done/attempted), suited to long-form (you do one at a time, you
don't browse 100). The manifest gains a `releaseDate`.

**Cadence: decouple release from authoring.** Batch-author + validate into a
**queue**, then **drip one per day**. A generation that fails the validator never
reaches the queue, so a bad case can't ship on a Tuesday; a buffer covers gaps.
The learner feels a daily rhythm; the pipeline runs in reliable batches. Whole
archive stays browsable — never rate-limit a keen learner. **Pilot: release the 5
over the first week or two to test the feed, then decide cadence.**

### 7.8 Authoring pipeline (offline, mirrors `author-cases.mjs`)
`scripts/author-longform.mjs` (Node orchestrator) per case:
1. **Brief** — human writes (or AI drafts) the scenario + intended trap.
2. **Generate** — Sonnet writes `dgp.py` (+ checkpoint prompts, memo rubric).
3. **Run** — shell out to **Python** (numpy/pandas) → emit `data.csv` + the true
   parameters.
4. **Validate** — run `solution.py` (a reference analysis) against the emitted
   CSV and confirm it **recovers the planted answer**, and that the naive path is
   wrong. Derive numeric **bands** from resampling. A case is valid only if the
   DGP and the reference solution agree.
5. **Critic** — Sonnet rubric pass on realism/fairness; revise loop.
6. **Emit** public `case.json` + `data.csv`; sealed `key.json`; commit `dgp.py` +
   `solution.py` for reproducibility; rebuild the manifest.

**New toolchain dependency:** offline Python (numpy/pandas) on the authoring
machine. Never in production.

---

## 8. On-disk layout (proposed)

```
public/case-lab/                     # PUBLIC tier (CDN-able)
  manifest.json                      # feed index: id, title, trap, releaseDate, estMinutes
  <id>/
    case.json                        # scenario, data schema, checkpoint PROMPTS, memo task
    data.csv                         # 10k+ rows

case-lab-sealed/                     # SEALED tier (private — NEVER shipped to client)
  <id>/
    key.json                         # checkpoint bands + mcq answers + memo rubric
    dgp.py                           # data-generating process (reproducibility)
    solution.py                      # reference analysis (validator)
```

---

## 9. New surfaces

- **Routes**: `/cases` gains a tab → long-form feed; `/cases/lab/[id]` the player
  (brief + Pyodide workbench + checkpoints + memo).
- **API**: `POST /api/cases/lab/grade` (server-side, reads sealed key) ·
  `POST /api/cases/lab/nudge` (cached hint).
- **Types**: `types/case-lab.ts` (new — Case, Checkpoint, Key, Attempt).
- **Loader**: `lib/case-lab/loader.ts` (public) + a sealed-key loader.
- **Migration**: `024_case_lab.sql` — `case_lab_attempts` (per learner: gap
  score, memo score, checkpoint results) + RLS.
- **Script**: `scripts/author-longform.mjs`.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Fair numeric grading across valid methods | Bands from DGP resampling; lean on mcq/direction; exact-numeric only for one-answer facts |
| Sealed key leakage | Key never under `public/`; grading server-side only |
| Daily cadence vs. authoring reality (5–20/mo) | Decouple: batch → validate → queue → drip; buffer + fallback |
| Breaks zero-runtime-AI | Cost bounded (1 memo call + optional cached hints); cap it |
| No-scroll rule | Long-form player is a **documented exception** (like the library) |
| Pyodide / CSV load latency | ~1 MB CSV; lazy-load worker; explicit loading state |
| Python in authoring toolchain | Offline only; document setup in the script README |

---

## 11. Success criteria (pilot)

- 5 inference cases, each **validated** (reference solution recovers the planted
  answer; naive path provably wrong) and shipped.
- A learner can: read the brief → analyse the CSV in-browser → pass checkpoints →
  submit a memo → receive a gap score + memo feedback + the planted insight.
- Grading is deterministic and **method-fair** (a correct-but-different analysis
  scores in-band).
- Runtime cost per completion ≤ ~1 Sonnet memo call + optional cached hints.
- Feed UX validated on the 5 before committing to a release cadence.

---

## 12. Proposed build sequence (for approval — still no code)

1. **Authoring pipeline + Case #1 validated** — prove DGP → run → validate → key
   on the campaign case (the riskiest, most novel piece; de-risk first).
2. **Player + Pyodide workbench + checkpoint grading API** — Case #1 end to end.
3. **Memo rubric grading.**
4. **Feed / file-explorer + manifest + `024` migration.**
5. **Author the remaining 4 cases; wire batch → queue.**
6. **Verify + ship behind a flag.**

---

## 13. Open questions (deferred, not blocking)

- **Name** of the mode ("The Case Lab" is a placeholder).
- Daily-cadence *commitment* (decide after the pilot feed test).
- Memo grading model + exact cost cap.
- When prediction-flavor cases enter (v2).
- Streak / leaderboard mechanics (v2+).
