# PRD — Long-Form Data Cases ("The Case Lab", working title)
**Version**: 0.2
**Status**: Draft — awaiting approval (no code yet)
**Builds on**: The Case Room (Phase 26) — **v1 rides its static-artifact rails**
**Focus**: A second, long-form mode inside `/cases`. The learner gets a real
business problem + a synthetic dataset they **take away and work in their own
tools / their favourite AI**, then compare their thinking against an expert
teaching note. **Zero runtime AI.**

> **Changelog — v0.1 → v0.2:** Dropped in-app grading *and* the in-browser
> workbench from v1. v1 is now an **ungraded "takeaway" case** (case + dataset +
> teaching-note reveal) that the learner works with their own AI/tools. This
> collapses the architecture back onto the Case Room's all-public, zero-AI
> pattern. Gap-score grading, the memo rubric, the in-app Pyodide workbench, and
> the sealed answer key all move to a documented **v2** (§13).

---

## 1. Problem / Goal

The Case Room's multiple-choice cases test *quick* judgment (10–15 min, no data
work). They can't hand a learner the thing that actually builds skill: **a messy,
realistic dataset and a real business question to wrestle with.**

**Goal (v1):** give the learner a strong *starting point* — a believable business
problem + a 10,000+ row synthetic dataset — that they take away and analyse in
whatever they like (a notebook, Excel, or their favourite AI). When they're done,
they reveal an **expert teaching note** and self-assess. No grading, no in-app
analysis, no runtime AI — just a high-quality, reusable case they can keep.

---

## 2. Users

The existing Hugh learner (data / analytics skill prep). Same auth gate, same
"data & analytics only" domain. Suits the learner who wants to *apply* judgment
on real data at their own pace, in their own environment.

---

## 3. Core concept — one case, v1 loop

1. **Brief** — a business scenario + the stakeholder's confident (wrong) belief +
   the question. E.g. *"Marketing swears the Q3 win-back email lifted retention.
   Fund it next quarter?"*
2. **Guiding questions** — a short list of prompts that scaffold the analysis
   (compute the naive effect → who was actually treated → what confounds it →
   estimate the honest effect). **Prompts to think about, not graded steps.**
3. **The dataset** — a **downloadable CSV** (10k+ rows). The learner works it in
   their own tools / their favourite AI. Hugh does not analyse it for them.
4. **Reveal the teaching note** — when ready, the learner opens the expert
   worked solution + the planted lesson ("the naive read says X; here's the
   confounder we planted; here's the honest answer") and **self-assesses**.

The mechanic is **self-directed case study + a revealed teaching note** — exactly
how business-school cases and textbook exercises work. The takeaway artifact (the
CSV + brief) is the learner's to keep, revisit, or put in a portfolio.

---

## 4. The keystone idea: the LLM never emits 10,000 rows (unchanged)

The LLM authors a small **data-generating process (DGP) script** (numpy/pandas)
that *plants the lesson* — a confounder, a Simpson's split, a survivorship gate.
Code runs it to emit the CSV. This is what makes the data **genuinely teach
something defensible** rather than being random noise, and it produces the known
ground truth that the **teaching note** is written against.

Even with no grading, the DGP matters: it's the difference between "here's some
fake data" and "here's data with a real, expert-verifiable lesson baked in."

---

## 5. Scope — the v1 pilot (5 inference cases)

Inference-first (causal-caution) — the highest-judgment territory, and a
non-arbitrary set: the five classic ways a confident wrong conclusion gets made.
Each is a distinct DGP archetype (seeding the reusable template library). In every
one, the naive answer is inflated and the honest answer is small.

| # | Trap | Case (the confident wrong belief) | Planted structure |
|---|---|---|---|
| 1 | Confounding / selection bias | "The Q3 win-back email lifted retention — fund it." | Campaign went to already-engaged users |
| 2 | Simpson's paradox | "New checkout converts *worse* overall — roll it back." | Reverses once split by device/segment mix |
| 3 | Regression to the mean | "We coached our worst reps and they improved." | Worst performers regress up anyway; true effect ≈ 0 |
| 4 | Survivorship bias | "Feature-X users churn less — push everyone to X." | Only long-survived accounts *can* use X |
| 5 | Seasonality confound | "Revenue jumped after the Nov loyalty launch." | November always spikes; incremental effect tiny |

Each case ships as: **brief + CSV + guiding questions + teaching note.**

---

## 6. Out of scope (v1 — all moved to v2, §13)

- **Grading of any kind** — no gap-score, no memo rubric, no correctness signal.
- **In-app analysis** — no Pyodide workbench; the learner uses their own tools/AI.
- **Sealed answer key** — nothing to game, so the teaching note is just a *reveal*
  (public, like the Case Room's counterfactual).
- **Per-learner scoring / attempts.** (A minimal "completed" flag is optional —
  §7.5.)
- **Prediction / Kaggle-style cases**, **leaderboards / streaks**, **mobile**.

---

## 7. Architecture — v1 rides the Case Room rails

### 7.1 Same static-artifact pattern, all-public, zero runtime AI
No divergence from the Case Room's model: everything is a static file under
`public/case-lab/`, read server-side via a loader mirroring `lib/cases/loader.ts`
(the same **GCS swap seam**). **No sealed tier** — with no grading, there's
nothing to hide, so the teaching note ships in the public case file. **No grading
API, no nudge API, no AI at request time.**

### 7.2 Data model (all public)
Per case: `case.json` (brief, data schema, guiding questions, **teaching note**) +
`data.csv` (the rows). The teaching note is revealed client-side on demand —
exactly like the Case Room reveals its counterfactual after a commit.

### 7.3 Case page (viewport-fit where it can be; scroll is a documented exception)
- Brief + guiding questions.
- **Schema + a static sample preview** (first ~10 rows rendered from a small
  sample baked into `case.json` — no Pyodide, just a table) so the learner can
  eyeball the data before downloading.
- **Download CSV** button (the takeaway).
- **Reveal teaching note** (the payoff).
- *Nicety (optional):* a "copy brief for your AI" action / downloadable bundle so
  pasting the case into ChatGPT/Claude is one click.

### 7.4 Delivery — a dated "file-explorer" feed
A new landing for long-form: a **dated feed** (date · problem · trap/difficulty ·
done/attempted), suited to long-form. The manifest gains a `releaseDate`. Release
cadence **decoupled from authoring**: batch-author + validate → queue → drip one
per day; a bad generation never reaches the queue. Daily *feel*, no daily SLA in
the pilot. Whole archive stays browsable. **Pilot: release the 5 over the first
week or two, then decide cadence.**

### 7.5 Progress (minimal or none)
v1 needs no scoring. Optional: a lightweight `case_lab_progress` (per learner:
`viewed` / `revealed` booleans) purely so the feed can show a "done" badge —
tolerant of the table being absent, exactly like the Case Room's `case_attempts`.
Can be deferred entirely if we want the smallest possible v1.

### 7.6 Authoring pipeline (offline, mirrors `author-cases.mjs`)
`scripts/author-longform.mjs` (Node orchestrator) per case:
1. **Brief** — human writes (or AI drafts) the scenario + intended trap.
2. **Generate** — Sonnet writes `dgp.py` + guiding questions + a draft teaching note.
3. **Run** — shell out to **Python** (numpy/pandas) → emit `data.csv` + the true
   parameters.
4. **Validate** — run a reference solution against the emitted CSV and confirm it
   **recovers the planted answer** (and that the naive path is wrong). *This step
   stays even though there's no grading* — a broken DGP would ship a **wrong
   teaching note**, which is worse than no case. **The validated reference
   solution becomes the teaching note** (it does double duty).
5. **Critic** — Sonnet rubric pass on realism/fairness of brief + teaching note.
6. **Emit** public `case.json` (brief, schema, sample rows, guiding questions,
   teaching note) + `data.csv`; commit `dgp.py` + `solution.py` for
   reproducibility; rebuild the manifest.

**New toolchain dependency:** offline Python (numpy/pandas) on the authoring
machine. Never in production.

---

## 8. On-disk layout (proposed) — public only

```
public/case-lab/                     # ALL PUBLIC (CDN-able) — no sealed tier in v1
  manifest.json                      # feed index: id, title, trap, releaseDate, estMinutes
  <id>/
    case.json                        # brief, data schema, sample rows, guiding questions, TEACHING NOTE
    data.csv                         # 10k+ rows (the takeaway)

# authoring-only, committed for reproducibility (not served):
scripts/case-lab-src/<id>/dgp.py     # data-generating process
scripts/case-lab-src/<id>/solution.py# reference analysis → became the teaching note
```

---

## 9. New surfaces (v1)

- **Routes**: `/cases` gains a tab → long-form feed; `/cases/lab/[id]` the case
  page (brief + guiding questions + sample preview + CSV download + teaching-note
  reveal). **No API routes.**
- **Types**: `types/case-lab.ts` (Case, Manifest, optional Progress).
- **Loader**: `lib/case-lab/loader.ts` (public; mirrors `lib/cases/loader.ts`).
- **Migration** *(optional)*: `024_case_lab_progress.sql` — a minimal
  `case_lab_progress` + RLS, or skip for the smallest v1.
- **Script**: `scripts/author-longform.mjs`.

---

## 10. Cost (v1)

- **Runtime: $0.** Zero AI at request time — same property as the Case Room.
- **Authoring: offline, one-time** — ~4 Sonnet calls/case (generate → validate →
  teaching note → critic) ≈ **$0.25–0.75 per case**; the **5-case pilot ≈ $1.50–4,
  once**. (Prices confirmed: Sonnet 4.6 $3/$15 per MTok.)
- **Storage: negligible** — ~1 MB CSV/case; 100 cases ≈ 100 MB on the GCS seam.

**Money is not the constraint.** The real investment is the authoring pipeline +
DGP archetypes and getting believable cases with correct teaching notes.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| A wrong teaching note (broken DGP) | Keep the offline **validate** step — the reference solution must recover the planted answer before the note ships |
| Self-directed → some learners won't do the work | Accepted; it's a *resource*, not a test. The takeaway artifact has standalone value |
| Believable business scenario + fair planted trap is hard | Authoring effort, front-loaded into ~15–25 DGP archetypes; re-skin thereafter |
| No-scroll rule | The case page is a **documented exception** (like the library) |
| "Bring your own AI" = we don't control that experience | Fine by design — v1 is a starting point, not a graded environment |
| Daily cadence vs. authoring reality | Decouple: batch → validate → queue → drip; buffer + fallback |

---

## 12. Success criteria (v1)

- 5 inference cases, each **validated** (reference solution recovers the planted
  answer; naive path provably wrong) and shipped.
- A learner can: read the brief → preview the schema/sample → **download the CSV**
  → work it in their own tools → **reveal the teaching note** → self-assess.
- Every teaching note provably matches its dataset (the validation gate).
- The dated feed works; the archive is browsable.
- **Zero runtime AI.**

---

## 13. v2 (deferred, documented) — grading + in-app analysis, layered on top

Because the DGP, guiding questions, and reference solution already exist, v2 is
**layering, not a rewrite**:

- **In-browser Pyodide workbench** — analyse the CSV without leaving Hugh (reuse
  `lib/code/pyodide.worker.ts`).
- **Gap-score grading** — checkpoint answers graded against a **band of correct
  outputs** derived from DGP resampling (method-fair); lean on MCQ/direction
  checkpoints, reserve exact-numeric for one-answer facts.
- **Written-recommendation memo** — one Sonnet rubric call (~1.5¢/completion).
- **Two-tier data** — *seal* the answer key (`key.json`) once there's a score to
  game; grading moves to a server-side API route (`/api/cases/lab/grade`).
- **Optional cached AI nudges** (`/api/cases/lab/nudge`, Haiku).
- **Prediction / Kaggle-style cases** (held-out-metric grading).
- **Streak / leaderboard** mechanics.

---

## 14. Proposed build sequence (for approval — still no code)

1. **Authoring pipeline + Case #1** — DGP → run → validate → the reference
   solution becomes the teaching note. (Riskiest/most novel; de-risk first.)
2. **Case page** — brief + guiding questions + static sample preview + CSV
   download + teaching-note reveal.
3. **Feed / file-explorer + manifest** (+ optional minimal `024` progress table).
4. **Author the remaining 4 cases; wire batch → queue.**
5. **Verify + ship behind a flag.**

---

## 15. Open questions (deferred, not blocking)

- **Name** of the mode ("The Case Lab" is a placeholder).
- Include the minimal `case_lab_progress` "done" badge in v1, or ship with no
  progress at all?
- The "copy brief / download bundle for your AI" nicety — v1 or later?
- Daily-cadence *commitment* (decide after the pilot feed test).
- When grading + in-app analysis (v2) get built.
