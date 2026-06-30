// Maps Hugh's chosen language id to a CodeMirror language extension.
//
// Multi-language by design, but non-blocking: only a couple of grammars are
// wired in (the data domain is overwhelmingly Python + SQL). Anything else — or
// pseudocode — falls back to an empty extension set, i.e. a plain editor with
// tabbing and monospace but no colouring. Highlighting is a nicety, never a gate.

import type { Extension } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";

/** Normalise common aliases to the canonical id used in the lookup table. */
function canonical(language: string): string {
  const l = (language || "").toLowerCase().trim();
  if (l === "py" || l === "python3") return "python";
  if (l === "postgres" || l === "postgresql" || l === "mysql" || l === "sqlite") return "sql";
  return l;
}

/**
 * Returns the CodeMirror extensions for a language, or an empty array (plain
 * editor) when the language isn't one we highlight. Always returns a fresh array
 * so callers can splice in editor-level extensions without mutating shared state.
 */
export function languageExtension(language: string): Extension[] {
  switch (canonical(language)) {
    case "python": return [python()];
    case "sql":    return [sql()];
    default:       return [];
  }
}

/** Whether a language has real highlighting (vs. the plain-editor fallback). */
export function isHighlighted(language: string): boolean {
  return languageExtension(language).length > 0;
}
