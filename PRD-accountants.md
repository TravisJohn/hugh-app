# PRD — Hugh for Accountants (working title)

**Version**: 0.1
**Status**: Draft — awaiting approval. No code written.
**Shape**: A variant of Hugh on branch `hugh-v1`, worktree `D:\WEB PROJECTS\hugh-v1`.
**Rollback**: `main` is untouched; tag `pre-narrow-market` marks the full Hugh.

---

## 1. Problem / Goal

Hugh today is a data & analytics learning platform for a general audience. Its
topic gate accepts anyone whose core skill is data-shaped, which means it has no
particular reason to be chosen by any particular person.

Accounting professionals are moving toward AI under real pressure, and they
arrive with something most learners do not: **a profession whose output is
reviewed, audited and regulated.** That is not a handicap to work around. It is
the scaffolding, and it is the thing generic "AI for professionals" material
cannot use.

**Goal (v1): find out whether narrowing Hugh to accountants makes it more
wanted, not just more specific.** Same engine, aimed at one profession.

This is a positioning bet with a product decision inside it, not a rewrite.

---

## 2. Users

Two, and they are genuinely different people. Serving both is a decision taken
deliberately in §3, not a failure to choose.

**A — The Leaver.** An accountant moving into a data-shaped job: FP&A analytics,
audit data analytics, finance systems. They want the analytics skill itself.
Hugh already serves this person; today it just does not say so.

**B — The Stayer.** An accountant who intends to remain an accountant and wants
AI inside the job they have — close, audit, advisory, reporting. Larger group.
Not served by Hugh today, and the reason is written into the code (§3).

Neither is Travis. This is the first version of Hugh with an audience that is
not its author, and that is the main thing that makes it hard.

---

## 3. The collision, and the decision that resolves it

**The collision.** `lib/learn/topic-domain.ts` names user B as its example of an
out-of-domain request: building RAG pipelines is in domain, using a chat
assistant to write faster is not. Separately, CLAUDE.md's Key Design Decisions
commit Hugh to teaching **concepts, not product surface**, because Hugh teaches
by conversation and cannot give hands-on practice — a topic naming a tool is
accepted only with a warning that the tool itself will not be taught.

So a straight reading of user B — teach me to drive an AI assistant inside
Excel — is refused by one rule and disappointed by the other. Building it anyway
would mean breaking both, and inheriting the problem the second rule exists to
prevent: material that dates on the next release.

**The decision.** User B is not taught tool mechanics. User B is taught **how to
use AI in work that has to survive review.**

- What can and cannot be delegated when a human signs the file
- How you verify an AI output well enough to stand behind it
- What the evidence and audit trail have to look like
- Client confidentiality limits on what may be sent to a model at all
- Where a hallucination is a filing risk rather than an inconvenience
- How a review control changes when the draft under review was machine-written

This is concepts, not product surface. It obeys both rules rather than
suspending them. It does not date. And it is the part no general AI course
teaches, because it only matters to professions that are reviewed.

**Consequence for scope:** if user B ever needs to be shown which button to
press, that is a different product and this PRD does not cover it.

---

## 4. How two entry points work without a new path

Not a signup fork, and not a second track-build route — CLAUDE.md Rule 3 forbids
a fourth path, and it was written after one was deleted for exactly that.

The gate is already three-way and already has the mechanism: `needs_angle`
exists for a topic whose reading is genuinely ambiguous, and it asks which one
the learner meant rather than deciding for them. A topic like "AI for audit" is
that shape.

```
"AI for audit"  ->  gate: needs_angle
                    |- "Build and analyse audit data yourself"  -> track A
                    |- "Use AI in audit work you already do"    -> track B
```

Both answers then run the existing `pending -> generateTrack -> ready | failed`
machine. Nothing new is added to the state machine; the judge prompt and the
suggestions change.

**The gate fails open by construction.** Any retarget of
`topicDomainJudgePrompt` must preserve that: a malformed response resolves to
`in`, and a badly written new prompt is therefore a hole, not a wall. This is a
review requirement, not a nice-to-have.

---

## 5. The three pillars, weighted differently

The pillars do not change. Their weighting per user does.

| Pillar | User A (Leaver) | User B (Stayer) |
|---|---|---|
| **Learn** | As today, accounting-flavoured topics | Carries the AI-under-review curriculum |
| **Apply** (code) | Python + SQL drills, as today | Light. Reading code, not writing it |
| **Show** (cases) | Analytics judgment cases | **The main pillar** — judgment under review |

That table is the whole architecture change. Cases is already static JSON with
zero runtime AI, which makes user B's core pillar the cheapest one Hugh has.

**The guard rail on "both":** both users share the same three pillars and the
same routes. The moment user B needs a surface user A does not have, that is the
signal this is two products, and it should be split rather than grown.

---

## 6. What this costs — the honest map

**No migrations.** Nothing in §3–§5 needs a schema change. This was checked, and
it is why the shared-Supabase question logged on 2026-09-10 stays deferred.

| Change | Where | Size |
|---|---|---|
| Retarget the domain gate | `lib/claude/prompts.ts` | Prompt |
| Two-angle suggestions | same | Prompt |
| Learning regions for accounting | `lib/learn/regions.ts` | Small, pure, tested |
| Case library re-authored | `lib/cases/` static JSON | **Large — content** |
| Landing page, three pillars | `app/page.tsx` | Copy |
| Track generation prompt | `lib/claude/prompts.ts` | Prompt |

The cost is not engineering. It is **writing the cases**, and that is the pillar
user B stands on. A thin case library means user B has no product.

---

## 7. Scope

**In:**
- Retargeted domain gate with the two-angle split.
- Accounting learning regions.
- A first case set for user B — reviewed-work judgment, not tool tutorials.
- Landing page and copy addressed to accountants.
- Both users reachable from the existing `/home/learn` topic picker.

**Out:**
- Any schema change. If one is proposed, this PRD stops and the shared-versus-
  separate Supabase decision is taken first.
- Tool tutorials, tool screenshots, which-button content of any kind (§3).
- CPE/CPD accreditation (§11 open question — may be the real adoption lever, and
  is a business decision, not a feature).
- Firm and team accounts, seats, admin-for-managers. Single learner only.
- Anything that changes `main`. This lives on `hugh-v1`.
- Mobile, per the standing DO NOT list.

---

## 8. Risks, stated up front

| Risk | v1 answer |
|---|---|
| "Both" produces a product that serves neither | The §5 guard rail: shared pillars and routes, or it splits. Falsifiable, and checked at each milestone. |
| The case library is too thin to carry user B | Accepted as the main cost. A case count is a v1 success criterion (§9), not an afterthought. |
| Retargeted gate lets everything in | The gate fails open, so a weak prompt is a hole. Gate behaviour gets tests before the prompt ships. |
| Teaching AI use on client data is professionally sensitive | It is also the subject. Content must state limits rather than assume them; confidentiality is a topic, not a disclaimer. |
| Hugh has no author-authority with accountants | Real and unresolved. Travis is not an accountant. See §11. |
| The market is crowded | Not disputed. The bet is the reviewed-work angle, not "AI for accountants" as a category. |

---

## 9. Success criteria

v1 succeeds if we can answer:

1. **Does an accountant reading the landing page recognise themselves** in under
   thirty seconds — specifically, can they tell which of the two paths is
   theirs?
2. **Does the two-angle gate split real typed topics correctly?** Tested against
   a written list of at least twenty phrasings an accountant would actually use.
3. **Is there a case set large enough to be a product** — a stated minimum count
   agreed at approval, not discovered later.
4. **Does user B's curriculum survive an accountant's reading?** At least one
   working accountant says the reviewed-work framing is the real problem and not
   a guess made from outside the profession.

A clear no on 4 kills the user-B half and leaves user A, which is a smaller,
cheaper and still coherent product. That is an acceptable outcome.

---

## 10. Deferred

- Firm and team accounts.
- CPE/CPD accreditation.
- Excel as an Apply surface. DuckDB-WASM already reads CSV, so a spreadsheet-
  shaped exercise may be reachable without new infrastructure — unexamined.
- A second profession on the same pattern. If the reviewed-work framing works
  for accountants it plausibly works for other reviewed professions, and that is
  the actual scale argument. Not now.

---

## 11. Open questions for approval

1. **Name.** Hugh is named after the person who interviewed you. Does the
   accountants' version keep the name, or is it a different product with a
   different one? This affects the landing page, the repo story and whether
   these two ever merge.
2. **Domain authority.** Neither of us is an accountant. Do you have access to
   one who will read the user-B curriculum before it is built? Success criterion
   4 depends on it, and it is the cheapest thing to get wrong.
3. **Case count for v1.** What number makes user B a product rather than a demo?
4. **Is CPE/CPD genuinely out?** It is listed out of scope because it is a
   business decision, but if it is the reason accountants would pay, it belongs
   in v1 and changes everything downstream.
