// Pure string helpers that bridge the structured `CodeExample` and the plain
// markdown that actually lives in the chat thread.
//
// Why merge code into the message text at all? Two reasons:
//  1. Display — assistant bubbles already render fenced code blocks (ChatBubble's
//     markdown renderer), so embedding the snippet needs no new component.
//  2. History — the chat model only sees message `content`. Embedding Hugh's
//     reference (and the learner's mirror) as fenced blocks keeps both in the
//     transcript, so Hugh can compare the learner's version against his own.

import type { CodeExample } from "@/types/askcode";

/**
 * Wrap raw code in a fenced markdown block tagged with its language.
 * The language is sanitised to a bare info-string token (letters/digits/+/-/#)
 * so it can't break out of the fence or inject markdown.
 */
export function fenceCode(language: string, code: string): string {
  const lang = (language || "").toLowerCase().replace(/[^a-z0-9+#-]/g, "");
  // Trim a single trailing newline so the closing fence sits flush.
  const body = code.replace(/\n$/, "");
  return `\`\`\`${lang}\n${body}\n\`\`\``;
}

/**
 * Compose the assistant message stored in the thread: Hugh's prose reply followed
 * by his reference snippet as a fenced block. When there is no example the reply
 * is returned untouched.
 */
export function mergeCodeExample(reply: string, example: CodeExample | null): string {
  if (!example || !example.code.trim()) return reply;
  const trimmed = reply.trimEnd();
  return `${trimmed}\n\n${fenceCode(example.language, example.code)}`;
}

/**
 * Does a message already contain a fenced code block? Used by the user bubble to
 * decide whether to render through markdown (so a mirrored snippet shows as a
 * styled block) instead of as raw preformatted text.
 */
export function hasFencedCode(text: string): boolean {
  return /```/.test(text);
}
