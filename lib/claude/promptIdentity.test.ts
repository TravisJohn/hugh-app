import { describe, it, expect } from "vitest";
import {
  PROMPT_IDS,
  KNOWN_PROMPT_VERSIONS,
  PLACEHOLDER_TOPIC,
  PLACEHOLDER_DOCUMENT,
  fingerprintOf,
  milestonePromptId,
  promptFingerprint,
  promptVersion,
} from "./promptIdentity";
import { milestoneGenerationPrompt } from "./prompts";

describe("the registry is the enforcement", () => {
  // This is the test the whole module exists for. A prompt edit changes its
  // fingerprint, this fails, and someone has to write down what changed —
  // which is the difference between a version you can trust and a constant
  // somebody forgot to bump.
  it.each(PROMPT_IDS)("has a registered human label for %s", id => {
    const fp = promptFingerprint(id);

    expect(
      KNOWN_PROMPT_VERSIONS[fp],
      `Prompt "${id}" has fingerprint ${fp}, which is not in KNOWN_PROMPT_VERSIONS. ` +
      `A prompt was edited. Add a NEW line mapping ${fp} to a fresh label — do not ` +
      `overwrite or relabel an existing entry, because generation rows already point at it.`,
    ).toBeDefined();
  });

  it("gives every prompt a distinct fingerprint", () => {
    const seen = new Set(PROMPT_IDS.map(promptFingerprint));
    expect(seen.size).toBe(PROMPT_IDS.length);
  });

  it("resolves a version to the readable label, not the hash", () => {
    expect(promptVersion("milestones.qa")).toBe("milestones.qa@1");
  });

  it("falls back to the raw fingerprint rather than throwing on an unknown hash", () => {
    // Guards the production behaviour: a missing label must never fail a
    // learner's track build, it must record an honest unlabelled hash.
    const unknown = fingerprintOf("a template nobody has registered");
    expect(KNOWN_PROMPT_VERSIONS[unknown]).toBeUndefined();
    expect(unknown).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("the two milestone templates are separate artifacts", () => {
  it("fingerprints the document branch differently from the Q&A branch", () => {
    // They are not one template with a slot: different framing, different scope
    // instruction, different injection defence. One fingerprint across both
    // would average two prompts that were never the same.
    expect(promptFingerprint("milestones.qa"))
      .not.toBe(promptFingerprint("milestones.document"));
  });

  it("picks the branch the generator will actually use", () => {
    expect(milestonePromptId()).toBe("milestones.qa");
    expect(milestonePromptId(undefined)).toBe("milestones.qa");
    expect(milestonePromptId("some extracted text")).toBe("milestones.document");
  });

  it("names the context arm only when there are answers to read", () => {
    const answers = [{ question: "why?", answer: "an interview next week" }];
    expect(milestonePromptId(undefined, answers)).toBe("milestones.qa.context");
    // Empty is not the context arm — the builder renders the plain template,
    // so naming it otherwise would record a fingerprint that was never sent.
    expect(milestonePromptId(undefined, [])).toBe("milestones.qa");
    expect(milestonePromptId(undefined, undefined)).toBe("milestones.qa");
  });

  it("agrees with the builder for every combination of inputs", () => {
    // The invariant, stated directly: whatever `milestonePromptId` names, the
    // template that `milestoneGenerationPrompt` renders under the same
    // arguments must hash to that id's fingerprint. If these two ever drift,
    // every provenance row written in between describes the wrong prompt.
    const answers = [
      { question: "PLACEHOLDER_QUESTION_1", answer: "PLACEHOLDER_ANSWER_1" },
      { question: "PLACEHOLDER_QUESTION_2", answer: "PLACEHOLDER_ANSWER_2" },
    ];
    const cases: Array<[string | undefined, typeof answers | undefined]> = [
      [undefined,              undefined],
      [undefined,              []],
      [undefined,              answers],
      [PLACEHOLDER_DOCUMENT,   undefined],
    ];

    for (const [doc, ans] of cases) {
      const id       = milestonePromptId(doc, ans);
      const rendered = milestoneGenerationPrompt(PLACEHOLDER_TOPIC, doc, ans);
      expect(fingerprintOf(rendered)).toBe(promptFingerprint(id));
    }
  });
});

describe("fingerprints are stable across calls and sensitive to edits", () => {
  it("returns the same value every time for an unchanged template", () => {
    expect(promptFingerprint("backlog.priority")).toBe(promptFingerprint("backlog.priority"));
  });

  it("moves when a single character of the template changes", () => {
    const template = milestoneGenerationPrompt(PLACEHOLDER_TOPIC);
    expect(fingerprintOf(template)).not.toBe(fingerprintOf(`${template} `));
  });

  it("does not depend on the learner's topic", () => {
    // The privacy property: the fingerprint must be a fact about the template,
    // never a value derived from what a learner typed.
    const a = fingerprintOf(milestoneGenerationPrompt("kafka streaming"));
    const b = fingerprintOf(milestoneGenerationPrompt("dimensional modelling"));
    expect(a).not.toBe(b);
    expect(promptFingerprint("milestones.qa")).not.toBe(a);
    expect(promptFingerprint("milestones.qa")).not.toBe(b);
  });
});

describe("placeholders never reach a real prompt", () => {
  it("keeps the placeholders recognisable in a rendered template", () => {
    // If either string ever turns up in traffic to Anthropic, a template
    // builder was called with the wrong argument.
    const rendered = milestoneGenerationPrompt(PLACEHOLDER_TOPIC, PLACEHOLDER_DOCUMENT);
    expect(rendered).toContain(PLACEHOLDER_TOPIC);
    expect(rendered).toContain(PLACEHOLDER_DOCUMENT);
  });

  it("does not leak a placeholder into a genuine generation prompt", () => {
    const real = milestoneGenerationPrompt("SQL window functions");
    expect(real).not.toContain(PLACEHOLDER_TOPIC);
    expect(real).not.toContain(PLACEHOLDER_DOCUMENT);
  });
});
