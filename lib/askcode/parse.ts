// Tolerant parser for the /api/learn/chat JSON response.
//
// Hugh is asked to return {reply, isOffTopic, codeExample}. The `reply` and any
// `code` are free-form text routinely containing quotes, newlines and
// back-slashes — exactly what breaks a strict JSON.parse when the model forgets
// to escape them. The old fallback ("treat the raw text as the reply") then
// dumped the entire `{"reply": ...}` object into the chat. This parser salvages
// the fields by hand so a stray quote degrades to a clean reply, never raw JSON.

import type { ChatResponse, CodeExample } from "@/types/askcode";

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();
}

/** Decode the standard JSON string escapes; leave any stray characters as-is. */
function unescape(s: string): string {
  return s.replace(/\\(["\\/bfnrt])/g, (_, c: string) => {
    switch (c) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "b": return "\b";
      case "f": return "\f";
      default:  return c; // " \ /
    }
  });
}

function toCodeExample(value: unknown): CodeExample | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { language?: unknown; code?: unknown };
  if (typeof v.code !== "string" || !v.code.trim()) return null;
  return { language: String(v.language ?? "").toLowerCase(), code: v.code };
}

/**
 * Parse a chat response, strictly when possible and by salvage when not. Always
 * returns a well-formed object; `reply` is "" only when nothing could be
 * recovered (the caller substitutes a user-facing fallback).
 */
export function parseChatResponse(raw: string): ChatResponse {
  const cleaned = stripFences(raw);

  // Fast path: well-formed JSON in our shape.
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    if (o && typeof o === "object" && !Array.isArray(o) && typeof o.reply === "string") {
      return {
        reply:       o.reply,
        isOffTopic:  o.isOffTopic === true,
        codeExample: toCodeExample(o.codeExample),
        covered:     o.covered === true,
      };
    }
    // Parsed, but not the {reply,...} object we expect — fall through.
  } catch {
    // fall through to salvage
  }

  // Salvage: pull each field out with the fixed schema as a guide. `reply` runs
  // up to the `,"isOffTopic"` delimiter (greedy — there is only one), tolerating
  // unescaped quotes/newlines inside it.
  let reply = "";
  const replyToOff = cleaned.match(/"reply"\s*:\s*"([\s\S]*)"\s*,\s*"isOffTopic"/);
  if (replyToOff) {
    reply = unescape(replyToOff[1]);
  } else {
    const replyToEnd = cleaned.match(/"reply"\s*:\s*"([\s\S]*?)"\s*}?\s*$/);
    if (replyToEnd) reply = unescape(replyToEnd[1]);
  }

  const off = cleaned.match(/"isOffTopic"\s*:\s*(true|false)/);
  const isOffTopic = off ? off[1] === "true" : false;

  const cov = cleaned.match(/"covered"\s*:\s*(true|false)/);
  const covered = cov ? cov[1] === "true" : false;

  let codeExample: CodeExample | null = null;
  if (!/"codeExample"\s*:\s*null/.test(cleaned)) {
    const codeM = cleaned.match(/"code"\s*:\s*"([\s\S]*?)"\s*\}/);
    const langM = cleaned.match(/"language"\s*:\s*"([^"]*)"/);
    if (codeM) {
      const code = unescape(codeM[1]);
      if (code.trim()) codeExample = { language: (langM?.[1] ?? "").toLowerCase(), code };
    }
  }

  // Plain-text fallback: the model ignored the JSON contract and just wrote prose.
  // Surface it as the reply (the long-standing behaviour) rather than a dead-end
  // error. We only do this when there's no `"reply":` field to bind — if one is
  // present but unbindable it's malformed JSON, and echoing it would re-leak
  // braces, so we leave reply empty for the caller's generic fallback instead.
  if (!reply.trim() && !/"reply"\s*:/.test(cleaned)) {
    reply = cleaned.trim();
  }

  return { reply, isOffTopic, codeExample, covered };
}
