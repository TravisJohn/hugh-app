import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { NoteMessageRole } from "@/types";

// ── The Coach: Hugh reads a test screenshot + the learner's reasoning ─────────
// This module is the *pure* payload builder for the Coach route — no OpenAI
// client, no I/O — so the message assembly can be unit-tested in isolation.

export const COACH_SYSTEM_PROMPT = [
  "You are Hugh, a sharp, encouraging coach for data & analytics practitioners",
  "(data engineering, data science, ML engineering, SQL, analytics, and the",
  "major clouds — AWS, GCP, Azure).",
  "",
  "The learner is reviewing a practice/exam question they got wrong or want to",
  "check. You are given: (1) the screenshot(s) of the question, and (2) the",
  "learner's own written reasoning — what they think the answer is and WHY.",
  "",
  "If more than one image is supplied, they are consecutive slices of ONE",
  "question — a page too tall to capture in a single screenshot — given top to",
  "bottom. Read them as one continuous page, never as separate questions. An",
  "option list may run across the boundary between two slices.",
  "",
  "Your job is to correct their thinking, not just hand over the answer:",
  "- Read the question in the screenshot carefully, including every option.",
  "- State the correct answer plainly and briefly.",
  "- Explain WHY it is correct, and pinpoint exactly where the learner's",
  "  reasoning went right or wrong — quote the phrase of theirs you're reacting to.",
  "- If they chose a wrong option, explain the specific trap that makes it look",
  "  right, so they recognise the pattern next time.",
  "- If their reasoning was sound, say so and reinforce the mental model.",
  "",
  "Be concise and concrete. Lead with the answer, then the why. Use plain",
  "language and short paragraphs; a compact bulleted list is fine. Do not invent",
  "details that aren't visible in the screenshot — if something is unreadable or",
  "missing, say so and ask for it. Stay within the data & analytics domain; if",
  "the screenshot is clearly off-topic, gently say this coach is for data work.",
].join("\n");

// The preamble names how many slices are coming and in what order, so the model
// stitches a two-part capture back into one question instead of treating the
// second half as a new one.
export function imagePreamble(count: number): string {
  return count > 1
    ? `Here are ${count} slices of a single question, in order from top to bottom. ` +
      "Read them as one continuous page before responding."
    : "Here is the screenshot of the question for this note. Read it carefully before responding.";
}

// Structural type for a message row — matches the persisted NoteMessage subset
// we care about, but kept local so callers can pass any compatible shape.
export interface CoachThreadMessage {
  role: NoteMessageRole;
  content: string;
}

/**
 * Assemble the OpenAI chat payload for a Coach turn.
 *
 * Order: system prompt → (one user message carrying every screenshot, if any)
 * → the note's chat thread in order. Images are attached once up front so the
 * model has them in view for the whole conversation; the thread keeps its real
 * user/assistant roles so follow-up turns read as a genuine conversation.
 *
 * @param thread        the note's messages, oldest first
 * @param imageDataUrls base64 `data:` URLs for each screenshot (may be empty)
 */
export function buildCoachMessages(
  thread: CoachThreadMessage[],
  imageDataUrls: string[],
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: COACH_SYSTEM_PROMPT },
  ];

  if (imageDataUrls.length > 0) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: imagePreamble(imageDataUrls.length) },
        ...imageDataUrls.map(
          (url) => ({ type: "image_url", image_url: { url } }) as const,
        ),
      ],
    });
  }

  for (const m of thread) {
    messages.push({ role: m.role, content: m.content });
  }

  return messages;
}
