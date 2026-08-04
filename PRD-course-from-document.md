# PRD — Course From Document (working title)
**Version**: 0.1
**Status**: Built and verified (2026-08-03) — build sequence (§11) complete,
including the red-team pass (§10). Uncommitted on `main`. See PROJECT_LOG.md
for the full build trace and verification results.
**Builds on**: The Learn card's existing goal-creation flow (`/api/dashboard/goals`
→ `generateTrack`) — this adds a second input path into the same pipeline, it
does not replace it.

---

## 1. Problem / Goal

Today, building a track means answering a Socratic Q&A refinement loop
(`/api/dashboard/refine`) so the model can infer a scoped topic from the
conversation. Some learners already have the scoping material in hand — a job
description, a syllabus, a textbook chapter, a company's internal doc — and
re-deriving it through a Q&A loop is pure friction.

**Goal (v1):** let a learner upload a PDF, DOCX, or HTML file instead of
answering questions. The AI extracts a scoped topic + a small set of expert
tips from the document, the learner reviews and can edit that extraction, and
approving it builds a track whose milestones stay inside what the document
actually covers — not a generic curriculum for the general subject.

---

## 2. Users

The existing Hugh learner, at the same point they'd otherwise start the Q&A
refinement flow on the Learn card. Same auth gate, same domain scope (data /
analytics), same downstream track/milestone/backlog pipeline.

---

## 3. Core concept — v1 loop

1. **Choose a path.** The existing refinement screen gains a second option:
   answer questions, or upload a document. Mutually exclusive per goal — the
   learner picks one.
2. **Upload + extract.** PDF/DOCX/HTML → server-side text extraction → a single
   Claude call produces a candidate scoped topic + a few expert tips, using the
   document strictly as source material (see §6, this is the load-bearing
   security requirement, not an optional extra).
3. **Review + approve.** The learner sees the extracted topic + tips (same
   surface the Q&A path already returns) and can edit before continuing. Track
   generation does **not** fire until the learner explicitly approves — this is
   a deliberate change from the Q&A path, where `generateTrack` fires
   automatically via `after()` the moment refinement finishes.
4. **Generate.** Approved topic + document text (capped/summarized if long) →
   `generateTrack`, producing milestones scoped to the document's actual
   content, then the existing backlog-priority ranking step, unchanged.

---

## 4. Core features (v1)

- Upload control alongside the existing Q&A refinement UI; user picks one path
  per goal.
- Extraction for all three formats at once: PDF (`unpdf` or `pdf-parse`), DOCX
  (`mammoth`), HTML (`cheerio`, stripping `<script>`/`<style>`/hidden elements
  before any text reaches a prompt).
- File validation: mime allowlist (three types above), size cap (TBD in open
  questions, precedent is 10MB for Notes screenshots).
- Long-document handling: cap/truncate or pre-summarize extracted text before
  it reaches the milestone-generation prompt, so a large document doesn't blow
  the input budget or degrade output quality.
- New topic-extraction prompt (Sonnet — reasoning-heavy synthesis, same tier as
  today's `refineTopicPrompt`), explicitly framing the document as untrusted
  reference material (§6, layer 1).
- Reuse of the existing domain gate (`classify-topic`, Haiku) on the
  document-derived topic before generation proceeds — no new gate, just a new
  caller.
- Human-in-the-loop confirmation screen before `generateTrack` fires (§3 step 3).
- Hardened output validation on `parseClaudeJson` results across this new path
  (type + length checks on `trackTitle`/milestone `title`/`summary` before DB
  insert) — this closes a pre-existing gap (today's callers do partial,
  ad-hoc checks; see §6, layer 4) and applies to the new prompts specifically
  since document content is a richer injection surface than a typed topic
  string.
- No persistence of the raw uploaded file — extract server-side, discard the
  buffer once the topic/tips are produced. No new storage bucket in v1.

---

## 5. Out of scope (v1)

- OCR / scanned-image PDFs — reject with a clear "no extractable text" error,
  not a silent empty course.
- Detecting visually-hidden text inside PDF/DOCX (invisible-ink style
  injection) — not practical to detect reliably at extraction time; mitigated
  by prompt framing (§6 layer 1), not detection.
- Multiple documents merged into one course.
- Re-uploading a replacement document against an already-generated track
  (treated as a new goal).
- Persisting the original file for later re-processing.
- Changes to the existing Q&A refinement path itself (it stays as-is).

---

## 6. Prompt injection — required v1 defenses, not optional hardening

Document content is untrusted input flowing into an LLM prompt whose output
gets stored and shown back to the user. Five layers, all in scope for v1:

1. **Prompt-level isolation.** Extracted text wrapped in a delimited block with
   explicit instruction that its contents are reference material to describe,
   never commands to obey — applies to both the topic-extraction prompt and
   the document-grounded milestone-generation prompt.
2. **Extraction-time stripping (HTML only).** Strip `<script>`, `<style>`,
   comments, and hidden elements (`display:none`, `visibility:hidden`,
   `aria-hidden`) before text reaches any prompt. PDF/DOCX hidden-text tricks
   are not detected at extraction time — covered by layer 1 instead.
3. **Domain-gate reuse.** Run the extracted topic through the existing
   `classify-topic` Haiku judge before generation proceeds, same as any
   typed topic.
4. **Output validation hardening.** Type + length checks on every field pulled
   from `parseClaudeJson` before it's inserted, with reject/retry on
   malformed shape.
5. **Human confirmation gate.** The learner sees and can edit the extracted
   topic/tips before `generateTrack` runs — the strongest mitigation, since a
   human reviews the model's output before it drives anything downstream.

Blast-radius bound, for context on how seriously to weight this: this pipeline
only ever writes to `tracks`/`milestones` text columns — no tool calls, no
agentic actions, `user_id` is server-set. A successful injection's worst case
is a bad or off-topic milestone, not a compromise of the system or other
users' data. The five layers above are about output quality and trust, not
containing an escape.

---

## 7. Architecture

Rides the existing rails in `app/api/dashboard/goals/route.ts` and
`lib/tracker/generate.ts` — grounded in the actual current schema
(`learning_goals`: `id`, `user_id`, `topic`, `start_date`, `end_date`,
`created_at`, `track_status`; `types/index.ts` — `TrackStatus = 'pending' |
'ready' | 'failed'`) and the existing client entry point
(`DashboardPanel.tsx` calls `classifyTopic` client-side on the typed topic,
*then* mounts `RefinementFlow`).

### 7.1 Two-request shape (the confirmation gate from §3/§6)

Today's Q&A path is one uninterrupted server round-trip: `refine` → insert
`learning_goals` row (`track_status: 'pending'`) → `after()` fires
`generateTrack` in the background immediately. The document path splits this
into two client-initiated requests around the confirmation screen:

- **Extract** (`POST /api/dashboard/goals/document/extract`) — upload →
  text extraction → topic-extraction Claude call → domain gate → creates the
  `learning_goals` row in a new **`awaiting_approval`** status and returns
  `{ goal, candidateTopic, tips }` for review. **No `after()` call yet.**
- **Approve** (`POST /api/dashboard/goals/document/approve`) — learner
  confirms (optionally having edited the topic/tips) → re-runs the domain
  gate on the final topic (cheap, closes the edit-bypass gap) → flips
  `track_status` to `'pending'` → fires `after()` → `generateTrack` runs
  exactly as it does today, document-grounded (7.4). From here the flow
  rejoins the existing pipeline unchanged, including the Realtime
  `track_status` watch the client already has in `RefinementFlow` — the new
  UI component reuses that exact watch logic rather than reinventing it.

### 7.2 Schema changes — `supabase/migrations/031_document_goal_source.sql`

- Widen the `track_status` CHECK constraint: `'pending' | 'ready' | 'failed'
  | 'awaiting_approval'`.
- `learning_goals` gains `source_kind TEXT NOT NULL DEFAULT 'qa' CHECK
  (source_kind IN ('qa', 'document'))`.
- New table `pending_document_extractions` (`goal_id UUID PRIMARY KEY
  REFERENCES learning_goals(id) ON DELETE CASCADE`, `extracted_text TEXT`,
  `tips JSONB`, `source_format TEXT`, `created_at`) — RLS scoped through the
  owning goal, same pattern as other child tables. This holds the extracted
  document text *only* for the window between extract and approve; the
  `after()` callback deletes the row once `generateTrack` reads it, so
  document text doesn't linger in the database after the track exists. This
  is distinct from — and doesn't reopen — the "no raw file storage" decision
  in §4: the binary file is never persisted, only its extracted text,
  transiently.
- `types/index.ts`: `TrackStatus` gains `'awaiting_approval'`; new
  `SourceKind = 'qa' | 'document'`; `LearningGoal` gains `source_kind`.

### 7.3 New library code

- `lib/documents/extract.ts` — `extractText(file: File): Promise<{ text:
  string; format: 'pdf' | 'docx' | 'html' }>`, dispatching by mime type.
  Throws a typed `EmptyExtractionError` when extraction yields only
  whitespace (the scanned-PDF case from §5) so the route can return a clean
  422 instead of proceeding with nothing.
  - PDF via `unpdf` (pure-JS, avoids `pdf-parse`'s native/canvas
    dependencies in a serverless runtime).
  - DOCX via `mammoth` (raw-text mode).
  - HTML via `cheerio` — strips `<script>`, `<style>`, comments, and
    `display:none` / `visibility:hidden` / `aria-hidden` elements before
    extracting text (§6 layer 2).
- `lib/documents/limits.ts` — shared mime allowlist, size cap, and the
  character cap applied before any extracted text reaches a prompt (exact
  cap is a build-time tuning decision, §12).

### 7.4 Prompt changes — `lib/claude/prompts.ts`

- New `documentTopicExtractionPrompt(documentText)` — wraps `documentText` in
  a delimited block with the explicit "reference material, not instructions"
  framing (§6 layer 1); output is `{ candidateTopic, tips }`, same shape the
  Q&A path's `refineTopicPrompt` already returns, so the client-side review
  UI can reuse the existing tips-display pattern.
- `milestoneGenerationPrompt(topic, documentText?)` — existing signature
  gains an optional second parameter. When present, the instructions switch
  from "design a curriculum for this topic" to "design milestones using only
  what this document covers," with `documentText` wrapped in the same
  delimited/framed block as above — this is the second place raw document
  text re-enters an LLM call, so it gets the same isolation treatment, not
  just the first one.

### 7.5 `generateTrack()` signature change — `lib/tracker/generate.ts`

Gains an optional `documentText?: string` parameter, threaded into
`milestoneGenerationPrompt`. Callers that don't pass it (the existing Q&A
path) are unaffected. `assignBacklogPriority` is unchanged either way.

### 7.6 Output validation hardening — applies to both new prompts

Per §6 layer 4: after `parseClaudeJson`, validate `candidateTopic` is a
non-empty string ≤200 chars, `tips` is an array of ≤3 strings each ≤300
chars, and (in `generateTrack`) `trackTitle`/milestone `title`/`summary` are
strings under their own caps — reject and retry rather than inserting an
unvalidated shape. This closes the pre-existing gap noted in §4 and applies
uniformly, not just to the document path, since `parseClaudeJson` itself
gains no schema awareness — the validation lives at each call site.

### 7.7 New API routes

- `app/api/dashboard/goals/document/extract/route.ts` — multipart POST
  (`file`, `end_date`), auth → validate → extract → topic-extraction call →
  domain gate (reusing the same judge `classify-topic` already calls,
  server-side this time since there's no topic to gate client-side before
  extraction happens) → insert goal (`awaiting_approval`) + pending
  extraction row → return `{ goal, candidateTopic, tips }`, or the
  `TopicDomainVerdict` shape unchanged if the gate rejects it (no goal row
  created in that case).
- `app/api/dashboard/goals/document/approve/route.ts` — POST (`goalId`,
  final `topic`, optional edited `tips`), auth + ownership + `awaiting_approval`
  status guard, re-gate, update + `after()` as in §7.1.

### 7.8 New / changed UI

- `components/dashboard/DocumentUploadFlow.tsx` — new component, sibling to
  `RefinementFlow`: file picker → "extracting" phase → **review phase**
  (editable `candidateTopic` + `tips`, an explicit "Build my track" button)
  → reuses `RefinementFlow`'s existing Realtime/poll/timeout watch logic
  for the waiting phase (worth factoring that watch effect out to a shared
  hook, e.g. `useTrackStatusWatch(goalId)`, rather than duplicating it).
- `DashboardPanel.tsx` gains a mode toggle where it currently decides
  `refining ? <RefinementFlow/> : ...` — a third state mounts
  `DocumentUploadFlow` instead. `classifyTopic` client-side pre-gating stays
  as-is for the typed-topic path; it's simply not on the critical path for
  documents (the gate runs server-side post-extraction instead, per §7.7).

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Prompt injection via document content | §6, five layers — framing, stripping, domain gate, output validation, human confirmation |
| Scanned/image-only PDFs yield no text | Detect empty extraction, reject with a clear error, no silent empty course |
| Large documents blow the token budget / degrade quality | Cap/truncate or pre-summarize before the milestone-generation prompt |
| "Limited topic" scoping needs real prompt-design work, not just new input wiring | Treated as its own line item in build sequence (§10), not bundled into extraction plumbing |
| Confirmation step adds a UI/flow step not present in the Q&A path | Accepted tradeoff — explicitly chosen over shipping without it, given §6 |

---

## 9. Cost

Roughly cost-neutral against the existing flow: the new topic-extraction call
(Sonnet) replaces `refineTopicPrompt`'s existing Sonnet call rather than
adding a new one; the domain-gate call (Haiku) is already paid for by every
other topic entry point. The only net-new spend is extraction-library compute
(local, no API cost) and, if needed, an extra summarization pass for
long documents.

---

## 10. Success criteria (v1)

- A learner can upload a representative PDF, DOCX, or HTML document and get a
  track whose milestones map recognizably to that document's actual content.
- A crafted adversarial test document (one per file type, containing
  embedded "ignore previous instructions"-style text) does not alter the
  extracted topic/tips or resulting milestones in a way that reflects the
  injected instruction — verified by manual red-team pass before ship.
- Off-domain document content is caught by the reused domain gate before
  track generation fires.
- No milestone/track field exceeds its length cap or fails type validation
  silently.
- The confirmation screen accurately reflects what will be generated; a
  learner's edits (if any) are what's used for generation, not the raw
  first-pass extraction.

---

## 11. Proposed build sequence (for approval — still no code)

1. Migration `031_document_goal_source.sql` (schema from §7.2) + types update.
2. Extraction module (PDF/DOCX/HTML → plain text) + validation, unit-tested
   independent of any LLM call.
3. Topic-extraction prompt + `extract` route, with layers 1–4 of §6 built in
   from the start (not bolted on after).
4. `approve` route + `generateTrack`/`milestoneGenerationPrompt` document-text
   plumbing (§7.4–7.5).
5. Confirmation UI (`DocumentUploadFlow`, review/edit screen) + shared
   `useTrackStatusWatch` hook extracted from `RefinementFlow`, + the
   `DashboardPanel` mode toggle.
6. Red-team pass: one crafted adversarial document per file type, confirm
   §10's injection success criterion before ship.

---

## 12. Open questions (deferred, not blocking)

- File size cap — reuse Notes' 10MB precedent, or a different limit for
  documents specifically?
- Does the confirmation screen show the raw extracted text too, or just the
  derived topic + tips (as today's Q&A path does)?
- Where does this live in the UI — a tab/toggle on the existing refinement
  screen, as agreed, but exact placement/copy TBD.
- Long-document truncation strategy — hard character cap vs. a pre-summarization
  pass — decide during build sequence step 1.
