# PRD — Code Typer (working title)

**Version**: 0.1
**Status**: Draft — awaiting approval. No code written.
**Shape**: Isolated prototype inside the Hugh repo, wired to nothing.
**Inspiration**: ZType (zty.pe) — a typing shooter. Its "type your own text" mode
already proves the engine's word source is pluggable; this asks whether a line
of code can take a word's place.

---

## 1. Problem / Goal

The Code pillar teaches patterns through drills and a sandbox. Both are
deliberate, untimed and thoughtful. Neither builds **fluency** — the state where
a familiar line comes out of the fingers without conscious assembly.

Typing games build that state for prose. The open question is whether the same
loop does anything useful for code, or whether it just trains typing.

**Goal (v1): find out.** Build the smallest playable thing that answers "is this
fun, and does it feel like it is teaching anything?" — and be willing to throw
it away.

This is a spike with a question attached, not a feature with a deadline.

---

## 2. Users

Travis, first and possibly only. The prototype exists to inform a product
decision, not to be shipped. If it survives that decision it gets a real PRD,
real rules and a real home; nothing here assumes it will.

---

## 3. The mechanic (v1 — transcription, decided)

Faithful to ZType:

- Meteors descend carrying a **visible line of code**.
- Typing the first character of a line **locks** onto that meteor. Further
  keystrokes fire at it while the lock holds.
- A correct full line destroys the meteor.
- A wrong keystroke **breaks the lock** and costs the combo — it does not end
  the run.
- Meteors reaching the bottom cost a life. Three lives.
- Waves get faster and lines get longer.

The learner never has to recall anything. The line is on screen. The skill under
test is speed and syntactic accuracy.

**Explicitly not v1:** the retrieval variant (a problem on the meteor, the
answer typed from memory). It teaches more but needs different pacing, and
mixing the two would answer neither question. Recorded in §8.

---

## 4. Colour coding

Colour carries **language**, because Hugh already teaches four and mixing them
is the interesting case:

| Colour | Language |
|---|---|
| Blue | Python |
| Yellow | JavaScript |
| Green | SQL |
| Violet | R |

This makes colour a real signal rather than decoration: the learner sees a
context switch coming before they read the line. Whether that helps or just adds
noise is one of the things the prototype is meant to reveal.

---

## 5. The hard design problem, stated up front

**Code is not words.** `df.groupby('col').sum()` under a per-keystroke fire-lock
means brackets, quotes, dots, underscores and case all have to be exact, at
speed, on a line that is three to five times longer than a typical ZType word.

Three specific risks, and the v1 answers:

| Risk | v1 answer |
|---|---|
| Lines are too long — one meteor takes the whole descent | Cap v1 lines at ~40 characters. Curate, do not generate. |
| Punctuation density makes typos constant and the game punishing | A typo breaks the lock but does **not** reset progress on that line. Softer than ZType on purpose. |
| It trains typing, not programming | Accepted for v1. This is the question, not a solved problem. §7 says how we would know. |

If the answer turns out to be "it is just typing practice", that is a valid and
cheap result.

---

## 6. Scope

**In:**
- One HTML file plus its scripts, opened directly in a browser. No build step.
- Canvas rendering, keyboard input, lock/fire/destroy loop, waves, lives.
- A hardcoded set of roughly 40–60 curated one-line snippets across the four
  languages.
- Score, combo, accuracy, and an end-of-run summary.

**Out:**
- Any connection to Hugh — no route, no import, no API, no database, no auth.
- Persistence beyond `localStorage` for a personal best.
- Sound, art, animation polish beyond what the loop needs to read clearly.
- Generating snippets from Hugh's existing pattern packs. That is the obvious
  port path if this survives, and deliberately not now.
- Mobile. Keyboard game.

---

## 7. Success criteria

The prototype succeeds if, after playing it, we can answer these:

1. **Is the loop fun for more than two minutes?** Measured by whether Travis
   plays a third run unprompted.
2. **Does the lock-and-fire mechanic survive punctuation?** Specifically: does a
   line like `SELECT * FROM t WHERE x > 1;` feel satisfying or infuriating?
3. **Does anything stick?** After several runs, does a snippet come out of the
   fingers faster than before? Honest self-report is enough at this stage.
4. **Is the language colour a signal or noise?**

A clear "no" on 1 or 2 kills it, and that is a good outcome for a day's work.

---

## 8. Deferred (v2, if there is one)

- **Retrieval mode** — problem on the meteor, answer typed from memory. The
  variant that would actually teach.
- **Snippets from Hugh's pattern packs**, so the game drills what the learner is
  currently studying rather than a fixed list.
- Difficulty from the learner's own drill history.
- Anything that requires it to live at a Hugh route.

---

## 9. Placement and why

`prototypes/code-typer/`.

Hugh's drift guards scan exactly three trees — `lib/`, `components/` and `app/`
— and demand that every directory, page and route in them belongs to a
registered feature. A prototype in any of those three would have to be
registered as a feature it is not. `prototypes/` is outside all three, so the
isolation is structural rather than a promise.

eslint has an existing precedent for this: `scripts/warm-start/**` sits in
`globalIgnores` with a written reason. `prototypes/**` follows it, so the spike
is not held to the app's lint rules while it is still a question.

**One consequence, stated plainly:** being in the repo means it is in your
backups and your git history, which is the point — but a spike that is never
deleted becomes a folder nobody understands in six months. If the answer to §7
is no, the prototype should be deleted, with the finding written into
PROJECT_LOG.md. The finding is the artifact worth keeping, not the code.

---

## 10. Open questions for approval

1. **Snippet source for v1** — I curate 40–60 lines, or you supply the list?
   Curating is faster; your list would be closer to what you actually want to
   drill.
2. **Does it need to run inside `npm run dev`?** A plain HTML file opened
   directly is the cleanest isolation. Serving it at a Hugh route would mean a
   page under `app/`, which puts it straight back inside the drift guards.
