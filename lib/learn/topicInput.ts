/**
 * The topic a learner types is the most widely-propagated untrusted string in
 * Hugh. It reaches eleven prompt sites, it is stored on the goal and the track,
 * and — via `focusedLearningSystemPrompt` — it is interpolated into a **system
 * prompt** that is then prompt-cached and replayed on every tutor turn for the
 * life of the goal.
 *
 * That is a higher-privilege position than uploaded document text ever reaches,
 * and until now it carried none of the document path's defences. This module is
 * the boundary: nothing derived from learner input should enter a prompt, or the
 * database, without passing through `checkTopic` first.
 *
 * Defence here is structural, and it is only half the job:
 *
 *  - **Normalisation** (this file) makes the string label-shaped — one line, no
 *    control characters, bounded length, delimiter tokens defanged. A label
 *    cannot masquerade as a block of instructions.
 *  - **Framing** (`learnerTopicBlock` in lib/claude/prompts.ts) tells the model
 *    the value is data to read, never commands to obey.
 *
 * Neither alone is sufficient. Framing without normalisation can be escaped by
 * a learner who closes the delimiter themselves; normalisation without framing
 * still hands the model a single line that reads like an instruction.
 *
 * Pure: no I/O, no dependencies, so both the client and the API routes can use
 * the same rules and cannot disagree about them.
 */

/**
 * Ceiling on a topic, in characters.
 *
 * 200 is not a new number — it is the cap the document path already enforces on
 * an extracted topic (`goals/document/approve`), and the cap
 * `parseMilestoneGeneration` already enforces on a generated track title. The
 * typed path was simply the one entry point that never adopted it.
 */
export const MAX_TOPIC_CHARS = 200;

/** Why a topic was refused. The caller turns this into copy or an HTTP status. */
export type TopicRejection = "empty" | "too_long";

/**
 * Replace every control character — newline and tab included — with a space.
 *
 * This is the part that matters most. A 200-character single line is a weak
 * vehicle for an injected instruction; 200 characters containing newlines can
 * be laid out to look like a fresh block of rules inside the system prompt they
 * land in. Removing the ability to draw lines removes most of that leverage.
 *
 * Written as a codepoint scan rather than a regex character class deliberately:
 * the class would have to be spelled with escapes, and an escape that silently
 * degrades to a literal control character in the source is exactly the kind of
 * edit that would disable this check without failing a test.
 */
function stripControlCharacters(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out;
}

/**
 * The framing delimiter itself, in any casing, opening or closing.
 *
 * Wrapping a value in `<learner_topic>…</learner_topic>` is only a boundary if
 * the value cannot write that boundary. A learner typing the closing tag would
 * otherwise end the data block early and have everything after it read as
 * prompt. Stripped rather than escaped: a topic has no legitimate reason to
 * contain this token, so there is nothing to preserve.
 */
const DELIMITER_TOKENS = /<\/?\s*learner_topic\s*>/gi;

/**
 * Reduce a raw topic to a single-line label.
 *
 * Order matters. Control characters become spaces *before* whitespace is
 * collapsed, so a newline does not survive as a run of blank space; the
 * delimiter strip runs after that, so a token a learner split across a newline
 * is caught rather than left half-standing. A final collapse tidies the gap the
 * strip leaves behind.
 *
 * Idempotent — normalising an already-normalised topic returns it unchanged.
 */
export function normalizeTopic(raw: string): string {
  return stripControlCharacters(raw)
    .replace(/\s+/g, " ")
    .replace(DELIMITER_TOKENS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A topic that passed, or the reason it did not. Never both. */
export type TopicCheck =
  | { ok: true;  topic: string }
  | { ok: false; rejection: TopicRejection };

/**
 * Normalise a raw topic and decide whether it may proceed.
 *
 * Length is measured **after** normalisation, so padding a topic with newlines
 * cannot be used to make an over-length string look short, and a topic that is
 * only whitespace is refused as empty rather than stored blank.
 *
 * Over-length is refused rather than truncated. Truncating would silently
 * change what the learner asked to study — and, worse, would build a whole
 * curriculum from half a sentence without ever saying so.
 */
export function checkTopic(raw: string): TopicCheck {
  const topic = normalizeTopic(raw ?? "");
  if (!topic)                         return { ok: false, rejection: "empty" };
  if (topic.length > MAX_TOPIC_CHARS) return { ok: false, rejection: "too_long" };
  return { ok: true, topic };
}

/** Human-facing copy for a refusal. Used by the API routes' 400 responses. */
export const TOPIC_REJECTION_MESSAGE: Record<TopicRejection, string> = {
  empty:    "Enter a topic to get started.",
  too_long: `Keep the topic under ${MAX_TOPIC_CHARS} characters — a short subject works better than a long description.`,
};
