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

  it("silences /notes so the learn-flow timer can't leak into the Notes workspace", () => {
    expect(isSilentRoute("/notes")).toBe(true);
    expect(isSilentRoute("/notes/")).toBe(true);
    // lookalike prefix must not be caught
    expect(isSilentRoute("/notebooks")).toBe(false);
  });
});

describe("isAskRoute", () => {
  it("flags the goal-scoped Ask page, which carries its own inline timer", () => {
    expect(isAskRoute("/study/abc/ask")).toBe(true);
    expect(isAskRoute("/study/abc/track")).toBe(false);
    expect(isAskRoute("/code/drill")).toBe(false);
  });

  it("no longer flags /learn, which was deleted", () => {
    // /learn was a second, unlinked entry point into tutoring. Nothing in the
    // app navigated to it, and anything saved from it created a track with no
    // goal - a track the board page could never find. If this route ever comes
    // back it needs a deliberate decision, not a silent re-match here.
    expect(isAskRoute("/learn")).toBe(false);
  });
});
