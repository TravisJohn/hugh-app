import { describe, it, expect } from "vitest";
import { isCodeModeRequest, isCodeModeCommand } from "./detect";

describe("isCodeModeRequest", () => {
  it("matches the bare keyword regardless of case", () => {
    expect(isCodeModeRequest("code mode")).toBe(true);
    expect(isCodeModeRequest("CODE MODE")).toBe(true);
    expect(isCodeModeRequest("Code Mode")).toBe(true);
  });

  it("matches when the keyword is embedded in a sentence", () => {
    expect(isCodeModeRequest("can we switch to code mode for this?")).toBe(true);
    expect(isCodeModeRequest("/code mode")).toBe(true);
  });

  it("tolerates extra inner whitespace and newlines", () => {
    expect(isCodeModeRequest("code   mode")).toBe(true);
    expect(isCodeModeRequest("code\nmode")).toBe(true);
  });

  it("does not match unrelated messages", () => {
    expect(isCodeModeRequest("how does the code work")).toBe(false);
    expect(isCodeModeRequest("what mode should I use")).toBe(false);
    expect(isCodeModeRequest("explain modecode")).toBe(false);
    expect(isCodeModeRequest("")).toBe(false);
  });

  it("requires the two words adjacent, not merely both present", () => {
    expect(isCodeModeRequest("the code runs in passive mode")).toBe(false);
  });
});

describe("isCodeModeCommand", () => {
  it("matches the bare command regardless of case or inner whitespace", () => {
    expect(isCodeModeCommand("code mode")).toBe(true);
    expect(isCodeModeCommand("Code Mode")).toBe(true);
    expect(isCodeModeCommand("CODE MODE")).toBe(true);
    expect(isCodeModeCommand("code   mode")).toBe(true);
  });

  it("tolerates a leading slash and trailing punctuation/whitespace", () => {
    expect(isCodeModeCommand("/code mode")).toBe(true);
    expect(isCodeModeCommand("code mode.")).toBe(true);
    expect(isCodeModeCommand("  code mode  ")).toBe(true);
    expect(isCodeModeCommand("code mode!")).toBe(true);
  });

  it("does NOT match sentences that merely mention code mode", () => {
    // These stay as ordinary questions to Hugh (flagged via isCodeModeRequest).
    expect(isCodeModeCommand("explain code mode to me")).toBe(false);
    expect(isCodeModeCommand("can we switch to code mode for this?")).toBe(false);
    expect(isCodeModeCommand("")).toBe(false);
  });
});
