// Tolerant parser for the /api/learn/chat JSON response.
//
// Hugh is asked to return {reply, isOffTopic, codeExample}. The `reply` and any
// `code` are free-form text routinely containing quotes, newlines and
// back-slashes — exactly what breaks a strict JSON.parse when the model forgets
// to escape them. The old fallback ("treat the raw text as the reply") then
// dumped the entire `{"reply": ...}` object into the chat. This parser salvages
// the fields by hand so a stray quote degrades to a clean reply, never raw JSON.

import type { ChatResponse, CodeExample } from "@/types/askcode";

// Models sometimes wrap the *entire* JSON payload in a ```json fence. Strip that
// outer wrapper only — this must NOT match a fence that happens to sit inside a
// field value (e.g. a code block the model inlined into "reply"), so the match is
// anchored to the whole trimmed string, not to any line start/end within it.
function stripFences(text: string): string {
  const trimmed = text.trim();
  const wrapped = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return wrapped ? wrapped[1].trim() : trimmed;
}

// If the model ignored the "codeExample only, never fenced in reply" rule and
// inlined a fenced block directly into `reply`, pull it out so the "Mirror this
// snippet" affordance still appears instead of silently degrading to plain text.
const INLINE_FENCE_RE = /```([a-zA-Z0-9+#-]*)\n([\s\S]*?)```/;

function extractInlineCodeExample(reply: string): { reply: string; codeExample: CodeExample } | null {
  const m = INLINE_FENCE_RE.exec(reply);
  if (!m) return null;
  const code = m[2].replace(/\n$/, "");
  if (!code.trim()) return null;
  const withoutFence = (reply.slice(0, m.index) + reply.slice(m.index + m[0].length))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { reply: withoutFence, codeExample: { language: (m[1] || "").toLowerCase(), code } };
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
      return finalize(o.reply, o.isOffTopic === true, toCodeExample(o.codeExample), o.covered === true);
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

  return finalize(reply, isOffTopic, codeExample, covered);
}

// Shared by both the fast and salvage paths: if the model inlined a fenced code
// block into `reply` instead of using `codeExample`, promote it so the block still
// renders as code and the "Mirror this snippet" affordance still appears.
function finalize(reply: string, isOffTopic: boolean, codeExample: CodeExample | null, covered: boolean): ChatResponse {
  if (!codeExample) {
    const extracted = extractInlineCodeExample(reply);
    if (extracted) return { reply: extracted.reply, isOffTopic, codeExample: extracted.codeExample, covered };
  }
  return { reply, isOffTopic, codeExample, covered };
}
