// ── What the topic gate has already asked about ─────────────────────────────
//
// The gate judges each topic from scratch, which is correct for a single call
// and wrong for a conversation. A learner told "Generative AI covers a lot of
// ground" who then types their own angle gets that angle classified with no
// knowledge that it was a second attempt — so when it is still broad, the judge
// returns the same three suggestions the learner has already turned down. The
// loop is not the learner failing to understand; it is the judge having no
// memory.
//
// This is that memory: the short list of attempts the gate has already asked
// about, carried back to it on the next call. Pure and bounded, because it is
// learner text on its way into a prompt and both properties matter there.

import { type TopicVerdict } from "@/lib/learn/topic-domain";

/**
 * How many prior attempts ride along. Three is enough for the judge to see the
 * shape of what the learner keeps reaching for, and small enough that a
 * wandering session cannot grow the prompt without bound.
 */
export const MAX_REMEMBERED_ATTEMPTS = 3;

/**
 * Fold a judged attempt into the history that the next call will carry.
 *
 * Only `needs_angle` is remembered, and the two exclusions are the point:
 *
 *   `in`  — the conversation is over. Nothing follows that could need context.
 *   `out` — Hugh declined. Feeding a refused topic back to the judge as
 *           context for the next one is how "help me find my way in" turns
 *           into "here is everything I have tried, relent" — the gate must not
 *           accumulate pressure to reverse itself.
 *
 * Returns a new array; never mutates.
 */
export function recordAttempt(
  history: readonly string[],
  topic:   string,
  verdict: TopicVerdict,
): string[] {
  if (verdict !== "needs_angle") return [...history];

  const trimmed = topic.trim();
  if (trimmed.length === 0) return [...history];

  // Retyping the same thing is not a new attempt. Case-insensitive, because
  // "generative ai" and "Generative AI" are the same attempt to everyone
  // except a string comparison.
  const seen = history.some(h => h.trim().toLowerCase() === trimmed.toLowerCase());
  if (seen) return [...history];

  return [...history, trimmed].slice(-MAX_REMEMBERED_ATTEMPTS);
}

/**
 * Sanitise a history that arrived over the wire before it reaches a prompt.
 *
 * The client sends this list back, so the route cannot assume it is the list
 * the client was given. Non-strings, blanks and duplicates are dropped and the
 * length is capped; each surviving entry still has to pass the same
 * `checkTopic` boundary as the topic itself, which is the route's job, not
 * this function's.
 */
export function sanitizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    if (out.some(o => o.toLowerCase() === trimmed.toLowerCase())) continue;
    out.push(trimmed);
  }
  return out.slice(-MAX_REMEMBERED_ATTEMPTS);
}
