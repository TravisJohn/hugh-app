import { describe, it, expect } from "vitest";
import {
  documentTopicExtractionPrompt,
  parseDocumentTopicExtraction,
  DocumentTopicExtractionError,
} from "./prompts";

describe("documentTopicExtractionPrompt", () => {
  it("wraps the document text in a delimited block with 'not instructions' framing", () => {
    const prompt = documentTopicExtractionPrompt("Some course material.");
    expect(prompt).toContain("<source_document>");
    expect(prompt).toContain("</source_document>");
    expect(prompt).toContain("Some course material.");
    // Guards against the injection-defense framing being edited away later —
    // this is the mitigation itself (PRD-course-from-document.md §6 layer 1),
    // not incidental prose.
    expect(prompt.toLowerCase()).toContain("not a set of instructions");
  });
});

describe("parseDocumentTopicExtraction", () => {
  it("parses a well-formed response", () => {
    const raw = JSON.stringify({
      candidateTopic: "SQL Window Functions for Reporting",
      tips: ["Practice with real queries.", "Start with ROW_NUMBER."],
    });
    const result = parseDocumentTopicExtraction(raw);
    expect(result.candidateTopic).toBe("SQL Window Functions for Reporting");
    expect(result.tips).toHaveLength(2);
  });

  it("tolerates markdown fences around the JSON", () => {
    const raw = "```json\n" + JSON.stringify({ candidateTopic: "Data Modeling Basics", tips: [] }) + "\n```";
    expect(parseDocumentTopicExtraction(raw).candidateTopic).toBe("Data Modeling Basics");
  });

  it("throws when candidateTopic is missing", () => {
    const raw = JSON.stringify({ tips: ["a tip"] });
    expect(() => parseDocumentTopicExtraction(raw)).toThrow(DocumentTopicExtractionError);
  });

  it("throws when candidateTopic is not a string (a hijacked shape)", () => {
    const raw = JSON.stringify({ candidateTopic: { injected: true }, tips: [] });
    expect(() => parseDocumentTopicExtraction(raw)).toThrow(DocumentTopicExtractionError);
  });

  it("throws when candidateTopic exceeds the length cap", () => {
    const raw = JSON.stringify({ candidateTopic: "x".repeat(201), tips: [] });
    expect(() => parseDocumentTopicExtraction(raw)).toThrow(DocumentTopicExtractionError);
  });

  it("throws when tips is not an array of strings", () => {
    const raw = JSON.stringify({ candidateTopic: "Topic", tips: [{ note: "not a string" }] });
    expect(() => parseDocumentTopicExtraction(raw)).toThrow(DocumentTopicExtractionError);
  });

  it("throws when a tip exceeds the length cap", () => {
    const raw = JSON.stringify({ candidateTopic: "Topic", tips: ["x".repeat(301)] });
    expect(() => parseDocumentTopicExtraction(raw)).toThrow(DocumentTopicExtractionError);
  });

  it("caps tips at 3 even if the model returns more", () => {
    const raw = JSON.stringify({ candidateTopic: "Topic", tips: ["a", "b", "c", "d", "e"] });
    expect(parseDocumentTopicExtraction(raw).tips).toHaveLength(3);
  });

  it("trims whitespace from candidateTopic", () => {
    const raw = JSON.stringify({ candidateTopic: "  Topic With Space  ", tips: [] });
    expect(parseDocumentTopicExtraction(raw).candidateTopic).toBe("Topic With Space");
  });
});
