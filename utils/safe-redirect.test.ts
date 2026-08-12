import { describe, it, expect } from "vitest";
import { safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it("allows a plain internal path", () => {
    expect(safeInternalPath("/tracker")).toBe("/tracker");
  });

  it("allows an internal path with query and hash", () => {
    expect(safeInternalPath("/mastery/abc?classic=1#top")).toBe("/mastery/abc?classic=1#top");
  });

  it("falls back on null/undefined/empty", () => {
    expect(safeInternalPath(null)).toBe("/home");
    expect(safeInternalPath(undefined)).toBe("/home");
    expect(safeInternalPath("")).toBe("/home");
  });

  it("falls back on a custom fallback value", () => {
    expect(safeInternalPath(undefined, "/tracker")).toBe("/tracker");
  });

  it("rejects javascript: URLs", () => {
    expect(safeInternalPath("javascript:alert(1)")).toBe("/home");
  });

  it("rejects data: URLs", () => {
    expect(safeInternalPath("data:text/html,<script>alert(1)</script>")).toBe("/home");
  });

  it("rejects absolute external URLs", () => {
    expect(safeInternalPath("https://evil.example/phish")).toBe("/home");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeInternalPath("//evil.example")).toBe("/home");
  });

  it("rejects encoded protocol-relative URLs", () => {
    expect(safeInternalPath("%2F%2Fevil.example")).toBe("/home");
  });

  it("rejects backslash variants that browsers normalize to //", () => {
    expect(safeInternalPath("/\\evil.example")).toBe("/home");
    expect(safeInternalPath("\\\\evil.example")).toBe("/home");
  });

  it("rejects encoded backslash variants", () => {
    expect(safeInternalPath("%5C%5Cevil.example")).toBe("/home");
  });

  it("rejects malformed percent-encoding rather than throwing", () => {
    expect(safeInternalPath("/tracker%")).toBe("/home");
  });

  it("rejects a path not starting with /", () => {
    expect(safeInternalPath("tracker")).toBe("/home");
  });
});
