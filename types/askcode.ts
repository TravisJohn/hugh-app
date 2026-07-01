// Types for "Code Mode" — the mirror-coding mode of the Ask-page chat composer.
//
// Code Mode is deliberately decoupled from the standalone `code/` Pyodide
// playground (see `types/code.ts`). This file owns only what the Ask chat needs:
// the optional code example Hugh may attach to a reply, and the language set the
// composer can highlight. Nothing here executes code — the editor is a writing
// surface whose output becomes a normal chat message.

/**
 * Languages the CodeMirror composer can syntax-highlight. Any other language
 * Hugh chooses still works — it falls back to a plain (no-highlight) editor —
 * but these are the ones with a real grammar wired in (`lib/askcode/language.ts`).
 */
export const SUPPORTED_LANGUAGES = ["python", "sql"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * A reference snippet Hugh attaches to a chat reply when (and only when) the
 * current topic genuinely has code worth practising. The learner mirrors it.
 *
 * Snippet discipline (enforced in the system prompt, not here): simple, short,
 * with only the card's core idea written concretely — surrounding scaffolding is
 * left as pseudocode / `...`.
 */
export interface CodeExample {
  /** Lowercase language id, e.g. "python", "sql". Drives editor highlighting. */
  language: string;
  /** The reference code itself. Core concrete; the rest pseudocode. */
  code: string;
}

/**
 * The shape `/api/learn/chat` returns. `codeExample` is `null` on every ordinary
 * turn and is only populated when Hugh decides to surface a snippet (whether the
 * learner asked via "code mode" or Hugh offered it proactively).
 *
 * `covered` is Hugh's own judgement that the learner has grasped the current
 * card's core ideas and reached a natural stopping point — the client uses it as
 * one trigger for the "save & wrap up" nudge. Conservative: false on most turns.
 */
export interface ChatResponse {
  reply:        string;
  isOffTopic:   boolean;
  codeExample:  CodeExample | null;
  covered:      boolean;
}
