import { describe, it, expect } from "vitest";
import { fenceCode, mergeCodeExample, hasFencedCode } from "./format";

describe("fenceCode", () => {
  it("wraps code in a language-tagged fence", () => {
    expect(fenceCode("python", "x = 1")).toBe("```python\nx = 1\n```");
  });

  it("lowercases and strips unsafe characters from the language tag", () => {
    expect(fenceCode("SQL", "select 1")).toBe("```sql\nselect 1\n```");
    expect(fenceCode("py thon`", "x")).toBe("```python\nx\n```");
  });

  it("does not double a trailing newline before the closing fence", () => {
    expect(fenceCode("python", "x = 1\n")).toBe("```python\nx = 1\n```");
  });
});

describe("mergeCodeExample", () => {
  it("returns the reply unchanged when there is no example", () => {
    expect(mergeCodeExample("hello", null)).toBe("hello");
  });

  it("returns the reply unchanged when the example code is blank", () => {
    expect(mergeCodeExample("hello", { language: "python", code: "  \n" })).toBe("hello");
  });

  it("appends the fenced snippet after the reply with a blank line", () => {
    const out = mergeCodeExample("Here it is:", { language: "python", code: "x = 1" });
    expect(out).toBe("Here it is:\n\n```python\nx = 1\n```");
  });

  it("trims trailing whitespace on the reply before appending", () => {
    const out = mergeCodeExample("Here:   \n\n", { language: "sql", code: "select 1" });
    expect(out).toBe("Here:\n\n```sql\nselect 1\n```");
  });
});

describe("hasFencedCode", () => {
  it("detects a fenced block", () => {
    expect(hasFencedCode("```python\nx\n```")).toBe(true);
  });

  it("is false for plain prose", () => {
    expect(hasFencedCode("just talking about code")).toBe(false);
  });
});
