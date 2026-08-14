import { describe, it, expect } from "vitest";
import {
  sanitizeCovered,
  sanitizeTranscript,
  MAX_COVERED_POINTS,
  MAX_DETAIL_CHARS,
  MAX_TRANSCRIPT_MESSAGES,
  MAX_MESSAGE_CHARS,
} from "./sessionRecord";

describe("sanitizeCovered — what a session established is never stored unchecked", () => {
  it("keeps well-formed points in order", () => {
    const covered = sanitizeCovered([
      { point: "Dot product alignment", detail: "Two vectors must match in length." },
      { point: "Normal equation",       detail: "Transposing yields a square matrix to invert." },
    ]);

    expect(covered).toEqual([
      { point: "Dot product alignment", detail: "Two vectors must match in length." },
      { point: "Normal equation",       detail: "Transposing yields a square matrix to invert." },
    ]);
  });

  it("drops a label with no substance behind it — the failure this record exists to prevent", () => {
    const covered = sanitizeCovered([
      { point: "Gradient descent", detail: "   " },
      { point: "Covariance",       detail: "It measures how two variables move together." },
    ]);

    expect(covered).toHaveLength(1);
    expect(covered?.[0].point).toBe("Covariance");
  });

  it("returns null rather than an empty list when nothing survives", () => {
    expect(sanitizeCovered([{ point: "Only a label" }])).toBeNull();
    expect(sanitizeCovered([])).toBeNull();
    expect(sanitizeCovered("covered")).toBeNull();
    expect(sanitizeCovered(undefined)).toBeNull();
  });

  it("caps the number of points", () => {
    const many = Array.from({ length: MAX_COVERED_POINTS + 5 }, (_, i) => ({
      point: `Point ${i}`, detail: "Substance here.",
    }));
    expect(sanitizeCovered(many)).toHaveLength(MAX_COVERED_POINTS);
  });

  it("truncates an over-long detail rather than dropping it", () => {
    const covered = sanitizeCovered([{ point: "Long", detail: "z".repeat(MAX_DETAIL_CHARS + 200) }]);
    expect(covered?.[0].detail).toHaveLength(MAX_DETAIL_CHARS);
  });

  it("ignores non-object items mixed into the array", () => {
    const covered = sanitizeCovered([null, 42, "text", { point: "Real", detail: "Substance." }]);
    expect(covered).toHaveLength(1);
  });
});

describe("sanitizeTranscript — the stored conversation", () => {
  it("keeps user and assistant turns", () => {
    const messages = sanitizeTranscript([
      { role: "user",      content: "Why transpose?" },
      { role: "assistant", content: "To square the matrix." },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages?.[0].role).toBe("user");
  });

  it("drops turns with an unknown role or empty content", () => {
    const messages = sanitizeTranscript([
      { role: "system", content: "hidden prompt" },
      { role: "user",   content: "  " },
      { role: "user",   content: "kept" },
    ]);
    expect(messages).toEqual([{ role: "user", content: "kept" }]);
  });

  it("caps message count and message length", () => {
    const many = Array.from({ length: MAX_TRANSCRIPT_MESSAGES + 10 }, () => ({
      role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 100),
    }));
    const messages = sanitizeTranscript(many);
    expect(messages).toHaveLength(MAX_TRANSCRIPT_MESSAGES);
    expect(messages?.[0].content).toHaveLength(MAX_MESSAGE_CHARS);
  });

  it("returns null when there is nothing usable", () => {
    expect(sanitizeTranscript([])).toBeNull();
    expect(sanitizeTranscript({ messages: [] })).toBeNull();
  });
});
