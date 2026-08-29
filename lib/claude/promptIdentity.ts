/**
 * Which prompt built this curriculum?
 *
 * `track_generations` records the model that generated a track. That is not
 * enough to compare two generations, because the prompt changes too — and a
 * prompt change is invisible unless something records it. This module is that
 * something (migration 048, decision D4 / R12).
 *
 * ── Why a fingerprint rather than a version constant ───────────────────────
 *
 * A hand-bumped `PROMPT_VERSION` works right up until someone edits a prompt
 * and forgets to bump it, at which point two genuinely different prompts share
 * a label and every comparison drawn across them is quietly wrong. That is not
 * hypothetical here: `lib/code/generateDrill.ts` already carries a
 * `DRILL_PROMPT_VERSION` with an instruction to remember, which is exactly the
 * mechanism this replaces rather than duplicates.
 *
 * A hash of the prompt text cannot be forgotten. `KNOWN_PROMPT_VERSIONS` then
 * gives each known hash a readable name, and `promptIdentity.test.ts` fails the
 * build when a template's fingerprint is missing from it. So editing a prompt
 * does not silently corrupt the eval — it fails a test until someone writes
 * down what changed. The enforcement is the test, not a person's memory.
 *
 * ── Why the templates are rendered with placeholders ───────────────────────
 *
 * Two reasons, and only the first is obvious.
 *
 * Determinism: hashing the prompt as actually sent would produce a different
 * fingerprint for every generation, which destroys the column's purpose.
 *
 * And privacy: it would also make `prompt_fingerprint` a value derived from the
 * learner's own topic, sitting in a service-role table they cannot reach or
 * delete — over a space small enough to attack by brute force. Rendering with
 * placeholders is therefore a requirement, not a convenience. Nothing in this
 * module may ever be called with real learner text.
 *
 * ── Why the model is NOT in the hash ───────────────────────────────────────
 *
 * `track_generations.model` is its own column, and the eval's central
 * comparison is "same prompt, different model" (E2, arms B and C). Folding the
 * model into the fingerprint would make that comparison inexpressible as
 * fingerprint equality. `max_tokens` is out for the same reason and gets its
 * own column: it shapes the output — a long track can be truncated by the
 * ceiling — so it belongs to the row, not to the prompt's identity.
 *
 * Pure apart from `node:crypto`, and free of `server-only`, so both the API
 * routes and an offline replay script can compute the same values.
 */

import { createHash } from "node:crypto";
import {
  milestoneGenerationPrompt,
  backlogPriorityPrompt,
} from "@/lib/claude/prompts";

/**
 * Stand-ins for learner input.
 *
 * Written to be unmistakable in a diff and in any hash basis: if one of these
 * ever appears in a real prompt sent to Anthropic, something has called a
 * template builder with the wrong argument. The topic placeholder is also
 * deliberately `checkTopic`-shaped — a single short line — because
 * `learnerTopicBlock` documents that its input has already been normalised.
 */
export const PLACEHOLDER_TOPIC    = "PLACEHOLDER_TOPIC";
export const PLACEHOLDER_DOCUMENT = "PLACEHOLDER_DOCUMENT_TEXT";

/**
 * Canonical milestone list for the ranking prompt.
 *
 * `backlogPriorityPrompt` interpolates a variable-length list, and the shape of
 * each rendered line is part of the template. Two entries is the smallest
 * number that exercises the join between them, so the separator is captured in
 * the hash and a change to it moves the fingerprint.
 */
const PLACEHOLDER_ITEMS = [
  { n: 1, title: "PLACEHOLDER_TITLE_1", summary: "PLACEHOLDER_SUMMARY_1" },
  { n: 2, title: "PLACEHOLDER_TITLE_2", summary: "PLACEHOLDER_SUMMARY_2" },
];

/**
 * Every prompt whose identity is recorded on a generation row.
 *
 * `milestones.qa` and `milestones.document` are two entries on purpose.
 * `milestoneGenerationPrompt` branches on whether a document was supplied and
 * returns two structurally different prompts — different framing, different
 * scope instruction, different injection defence. They are separate artifacts
 * that happen to live in one function, and giving them one fingerprint would
 * average two things that were never the same.
 */
export const PROMPT_IDS = [
  "milestones.qa",
  "milestones.document",
  "backlog.priority",
] as const;

export type PromptId = (typeof PROMPT_IDS)[number];

/**
 * Each prompt's canonical placeholder call.
 *
 * There is no generic way to render a template — one prompt takes a list whose
 * line shape matters, another takes a turn counter — so every fingerprinted
 * prompt declares its own call here. Adding a prompt to the eval means adding a
 * line to this record, which is the deliberate friction: the alternative is a
 * helper that produces a structurally wrong template for some callers.
 */
const TEMPLATE_BUILDERS: Record<PromptId, () => string> = {
  "milestones.qa":       () => milestoneGenerationPrompt(PLACEHOLDER_TOPIC),
  "milestones.document": () => milestoneGenerationPrompt(PLACEHOLDER_TOPIC, PLACEHOLDER_DOCUMENT),
  "backlog.priority":    () => backlogPriorityPrompt(PLACEHOLDER_TOPIC, PLACEHOLDER_ITEMS),
};

/**
 * How many hex characters of the SHA-256 to keep.
 *
 * 16 is 64 bits. These are compared for equality against a handful of known
 * values, never used as a security boundary, and a short hash is one a person
 * can read out of a query result and match by eye.
 */
const FINGERPRINT_CHARS = 16;

/** Hash arbitrary template text. Exported for the test, which hashes variants. */
export function fingerprintOf(templateText: string): string {
  return createHash("sha256").update(templateText, "utf8").digest("hex").slice(0, FINGERPRINT_CHARS);
}

/**
 * Fingerprints, computed once at module load.
 *
 * The templates are constants, so this costs nothing per generation — the work
 * happens when the module is first imported and never again.
 */
const FINGERPRINTS: Record<PromptId, string> = {
  "milestones.qa":       fingerprintOf(TEMPLATE_BUILDERS["milestones.qa"]()),
  "milestones.document": fingerprintOf(TEMPLATE_BUILDERS["milestones.document"]()),
  "backlog.priority":    fingerprintOf(TEMPLATE_BUILDERS["backlog.priority"]()),
};

/**
 * Human labels for fingerprints we have seen and named.
 *
 * Keyed by fingerprint, not by prompt id, so history accumulates: when a prompt
 * is edited its old entry stays and a new one is added beside it, and rows
 * written under either remain readable forever.
 *
 * **When a test fails saying a fingerprint is unregistered:** a prompt was
 * edited. Add the new fingerprint here with a fresh label — do not overwrite
 * the old line, and do not change the label of an existing fingerprint, because
 * rows already in the database point at it.
 */
export const KNOWN_PROMPT_VERSIONS: Record<string, string> = {
  "3309ed3a3d9d3926": "milestones.qa@1",
  "eb74a8bd940e372b": "milestones.document@1",
  "d3198277d58e4850": "backlog.priority@1",
};

/** The fingerprint of a prompt's current template. */
export function promptFingerprint(id: PromptId): string {
  return FINGERPRINTS[id];
}

/**
 * The readable name for a prompt's current template.
 *
 * Falls back to the raw fingerprint rather than throwing. An unregistered
 * prompt is a bug the test catches at build time, but if one ever reaches
 * production the right behaviour is to record an honest unlabelled hash — not
 * to fail a learner's track build over a missing string.
 */
export function promptVersion(id: PromptId): string {
  const fp = FINGERPRINTS[id];
  return KNOWN_PROMPT_VERSIONS[fp] ?? fp;
}

/** Which milestone-generation template a given call will actually use. */
export function milestonePromptId(documentText?: string): PromptId {
  return documentText ? "milestones.document" : "milestones.qa";
}
