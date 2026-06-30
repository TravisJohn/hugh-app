# Manual Test — Code Mode (Ask page)

Phase 22. Verifies the live Hugh round-trip that unit tests can't cover (the
actual model decision + the composer UX). ~5–10 min.

## Prerequisites
- `npm run dev`, logged in, `ANTHROPIC_API_KEY` set in `.env.local`.
- Chrome/Edge (Ask page is desktop-only).
- At least one study goal. Ideally **two** goals so you can test both branches
  cleanly (worthiness is judged against the goal's topic + focused milestone):
  - **Code-worthy goal** — e.g. topic *"Pandas for data analysis"* or *"SQL window
    functions"* or *"Apache Airflow"*.
  - **Non-code goal** — e.g. topic *"Communicating insights to stakeholders"* or
    *"Data team roles and responsibilities"* or *"Data storytelling"*.
- Open a goal → **Ask** tab (`/study/<goalId>/ask`). Optionally focus a milestone
  so the topic is specific.

---

## Branch A — Code-worthy topic → snippet + mirror (the happy path)

On the **code-worthy** goal:

1. In the chat input, type **`code mode`** and send. (Or be specific:
   `code mode — show me a simple groupby aggregation`.)
2. **Expect:** Hugh replies with a short framing sentence, a **fenced code block**
   (syntax-highlighted, copy button), and an **action point** inviting you to
   retype it with your own comments. The code is minimal — only the core idea
   concrete, the rest pseudocode/`...`.
3. **Expect:** a violet **“Mirror this snippet — retype it with your own comments”**
   button appears just above the input. The input is still a normal textbox
   (offer-first, not auto-switched).
4. Click the button. **Expect:** the input becomes a **CodeMirror editor** with a
   header reading `Code mode · PYTHON` and an **Exit** link.
5. In the editor: press **Tab** → inserts indentation (does *not* move focus).
   Retype the snippet, adding a `# comment` in your own words on each line.
6. Press **⌘/Ctrl+Enter** (or click **Send code**). **Expect:** your code posts as
   a **right-aligned chat message rendered as a styled code block** (not literal
   back-ticks), the editor reverts to the normal textbox, and the offer button is
   gone.
7. **Expect:** Hugh's next reply **references what you actually wrote** — confirming
   correct lines, correcting mistakes, or asking about your comments.

**Pass = steps 2, 6, 7 all hold** (snippet is minimal & on-topic; your code renders
as code; Hugh validates *your* version).

---

## Branch B — Non-code topic → conversational decline (no fabrication)

On the **non-code** goal (e.g. *"Communicating insights to stakeholders"*):

1. Type **`code mode`** and send.
2. **Expect:** Hugh replies **conversationally that code isn't needed here** and
   steers back to the topic. **No code block. No “Mirror this snippet” button.**
3. **Fail** if Hugh invents an irrelevant snippet (e.g. unrelated Python) just
   because you said the keyword.

**Pass = a graceful, code-free decline.**

---

## Branch C — Hugh proactively offers code (no keyword)

On the **code-worthy** goal:

1. Ask a normal question that begs for an example, e.g.
   `How do I filter rows in pandas?` (do **not** type "code mode").
2. **Expect:** Hugh may include a snippet + the **Mirror this snippet** button on
   his own initiative. (Model-dependent — if he answers in prose only, rephrase to
   `Can you show me a tiny example of filtering rows in pandas?`)
3. Mirror it as in Branch A. **Expect:** same editor flow and validation.

**Pass = a snippet can surface without the keyword.**

---

## Branch D — Multi-language + plain fallback

1. On a SQL-flavoured goal/milestone (e.g. *"SQL window functions"*), type
   `code mode`. **Expect:** the editor header reads `Code mode · SQL` and SQL is
   highlighted.
2. (Optional) If Hugh ever picks a language with no grammar wired in (anything
   other than Python/SQL), **expect** the header to show `plain editor` and the
   editor still works — just without colouring. Tab + send still function.

**Pass = language follows the snippet; unknown languages degrade to a plain editor.**

---

## Mechanics / regression checks (any branch)

- **Exit** link in the code editor → returns to the textbox; the **Mirror this
  snippet** button reappears (offer preserved) so you can re-enter.
- **Empty guard:** Send code is disabled until the editor has non-whitespace.
- **No-scroll budget:** with the editor open, the chat above still scrolls and the
  page does not overflow the viewport. Editor caps at ~13rem then scrolls
  internally.
- **Normal chat unaffected:** plain text messages still send via Enter and render
  as before; a normal message that happens to contain back-ticks still renders its
  code block (this was always true for assistant turns).
- **Usage meter** (header) ticks up per turn as usual — code mode reuses
  `/api/learn/chat`.

---

## If something's off
- No `codeExample` ever appears on an obviously code-worthy topic → check the
  server log for `[learn/chat]` JSON-parse fallback (Claude may have drifted from
  the schema); the reply still shows but without a structured snippet.
- Editor doesn't highlight SQL → confirm `@codemirror/lang-sql` is installed
  (`npm ls @codemirror/lang-sql`).
- Mirrored message shows literal ` ``` ` → `hasFencedCode` / ChatBubble markdown
  branch regressed.
