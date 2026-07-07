import { describe, it, expect } from "vitest";
import { isSilentRoute, isAskRoute } from "./routes";

describe("isSilentRoute", () => {
  it("silences the Code activity so the Pomodoro timer + music stay in the learn flow", () => {
    expect(isSilentRoute("/code")).toBe(true);
    expect(isSilentRoute("/code/")).toBe(true);
    expect(isSilentRoute("/code/start")).toBe(true);
    expect(isSilentRoute("/code/drill")).toBe(true);
  });

  it("keeps the timer on learn-flow routes", () => {
    expect(isSilentRoute("/learn")).toBe(false);
    expect(isSilentRoute("/home/learn")).toBe(false);
    expect(isSilentRoute("/study/abc/track")).toBe(false);
    expect(isSilentRoute("/study/abc/ask")).toBe(false);
    expect(isSilentRoute("/tracker")).toBe(false);
  });

  it("does not catch lookalike prefixes", () => {
    expect(isSilentRoute("/codex")).toBe(false);
  });

  it("still silences the existing focused/admin routes", () => {
    expect(isSilentRoute("/admin")).toBe(true);
    expect(isSilentRoute("/review/xyz")).toBe(true);
    expect(isSilentRoute("/mastery/xyz")).toBe(true);
    expect(isSilentRoute("/converse")).toBe(true);
  });
});

describe("isAskRoute", () => {
  it("flags the pages that carry their own inline timer control", () => {
    expect(isAskRoute("/learn")).toBe(true);
    expect(isAskRoute("/study/abc/ask")).toBe(true);
    expect(isAskRoute("/study/abc/track")).toBe(false);
    expect(isAskRoute("/code/drill")).toBe(false);
  });
});
