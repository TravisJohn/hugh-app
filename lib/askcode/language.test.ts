import { describe, it, expect } from "vitest";
import { languageExtension, isHighlighted } from "./language";

describe("languageExtension", () => {
  it("returns a non-empty extension set for highlighted languages", () => {
    expect(languageExtension("python").length).toBeGreaterThan(0);
    expect(languageExtension("sql").length).toBeGreaterThan(0);
  });

  it("normalises common aliases", () => {
    expect(isHighlighted("py")).toBe(true);
    expect(isHighlighted("python3")).toBe(true);
    expect(isHighlighted("PostgreSQL")).toBe(true);
    expect(isHighlighted("mysql")).toBe(true);
  });

  it("falls back to a plain editor for unsupported languages", () => {
    expect(languageExtension("rust")).toEqual([]);
    expect(languageExtension("pseudocode")).toEqual([]);
    expect(languageExtension("")).toEqual([]);
  });

  it("returns a fresh array each call (no shared mutable state)", () => {
    const a = languageExtension("python");
    const b = languageExtension("python");
    expect(a).not.toBe(b);
  });
});
