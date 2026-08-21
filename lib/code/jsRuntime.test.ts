import { describe, it, expect } from "vitest";
import {
  SHADOWED_GLOBALS,
  buildCellSource,
  executeCell,
  formatJsError,
  serializeEnvelope,
  toEnvelope,
} from "./jsRuntime";

// These tests cover the JavaScript drill runtime's real execution path, not a
// stand-in for it: executeCell is the exact function js.worker.ts calls, so a
// regression in scope sharing, assertion handling or error attribution fails
// here rather than only in a browser nobody is watching.

describe("toEnvelope", () => {
  it("renders an array of plain objects as the table it actually is", () => {
    const rows = [{ name: "Ann", amount: 30 }, { name: "Ben", amount: 50 }];
    expect(toEnvelope(rows)).toEqual({ kind: "table", rows });
  });

  it("keeps an array of primitives a value, not a one-column table", () => {
    // .map() over a column is the commonest cell result in the shaping packs;
    // rendering ["Ann","Ben"] as a table would be noise.
    expect(toEnvelope(["Ann", "Ben"])).toEqual({ kind: "value", value: ["Ann", "Ben"] });
  });

  it("keeps a mixed array a value, since it has no consistent columns", () => {
    expect(toEnvelope([{ a: 1 }, "Ben"])).toEqual({ kind: "value", value: [{ a: 1 }, "Ben"] });
  });

  it("keeps an empty array a value rather than a table with no columns", () => {
    expect(toEnvelope([])).toEqual({ kind: "value", value: [] });
  });

  it("treats undefined and null alike, so a cell that returns nothing shows nothing", () => {
    expect(toEnvelope(undefined)).toEqual({ kind: "value", value: null });
    expect(toEnvelope(null)).toEqual({ kind: "value", value: null });
  });

  it("sorts a Set, because insertion order is not a stable preview", () => {
    // new Set(...) is how the packs dedupe; two learners with the same correct
    // answer must see the same preview.
    expect(toEnvelope(new Set(["paris", "london", "paris"]))).toEqual({
      kind: "value",
      value: ["london", "paris"],
    });
  });

  it("renders a Map of counts as a key/value table", () => {
    const counts = new Map([["london", 3], ["paris", 2]]);
    expect(toEnvelope(counts)).toEqual({
      kind: "table",
      rows: [{ key: "london", value: 3 }, { key: "paris", value: 2 }],
    });
  });

  it("keeps a Map of non-primitives a value — its rows would not be flat", () => {
    const grouped = new Map([["london", [1, 2]]]);
    expect(toEnvelope(grouped)).toEqual({ kind: "value", value: { london: [1, 2] } });
  });

  it("keeps a class instance a value rather than mistaking it for a row", () => {
    expect(toEnvelope([new Date(0)]).kind).toBe("value");
  });
});

describe("serializeEnvelope", () => {
  it("survives values JSON.stringify would throw on or silently drop", () => {
    // A preview must never be the reason a passing cell looks broken.
    expect(serializeEnvelope(toEnvelope(BigInt(10)))).toContain("10");
    expect(serializeEnvelope(toEnvelope(NaN))).toContain("NaN");
    expect(serializeEnvelope(toEnvelope(Infinity))).toContain("Infinity");
    expect(serializeEnvelope(toEnvelope(() => 1))).toContain("[Function");
  });

  it("breaks a circular reference instead of blowing the stack", () => {
    const a: Record<string, unknown> = { name: "Ann" };
    a.self = a;
    expect(serializeEnvelope(toEnvelope(a))).toContain("[Circular]");
  });

  it("renders a Date as an ISO string", () => {
    expect(serializeEnvelope(toEnvelope(new Date(0)))).toContain("1970-01-01");
  });

  it("emits parseable JSON for a table, since DrillMock JSON.parses the last line", () => {
    const json = serializeEnvelope(toEnvelope([{ a: 1 }]));
    expect(JSON.parse(json)).toEqual({ kind: "table", rows: [{ a: 1 }] });
  });
});

describe("formatJsError", () => {
  it("keeps the error name, which carries most of the teaching", () => {
    // "total is not defined" alone doesn't tell the learner it was never created.
    expect(formatJsError(new ReferenceError("total is not defined"))).toBe(
      "ReferenceError: total is not defined",
    );
  });

  it("takes only the first line of a multi-line message", () => {
    expect(formatJsError(new Error("boom\n  at line 3"))).toBe("Error: boom");
  });

  it("handles a thrown non-Error", () => {
    expect(formatJsError("just a string")).toBe("just a string");
    expect(formatJsError(undefined)).toBe("undefined");
  });
});

describe("buildCellSource", () => {
  it("puts the phase marker between the two halves so a throw can be attributed", () => {
    const src = buildCellSource("const a = 1;", "assert(a === 1);");
    expect(src.indexOf("const a = 1;")).toBeLessThan(src.indexOf('__phase("check")'));
    expect(src.indexOf('__phase("check")')).toBeLessThan(src.indexOf("assert(a === 1);"));
  });
});

describe("executeCell", () => {
  it("passes when the learner's code satisfies the check", async () => {
    const r = await executeCell("const total = 2 + 3;", "assert(total === 5);");
    expect(r).toEqual({ passed: true, stdout: "", error: null });
  });

  it("shares scope between code and check — the whole reason they are one body", async () => {
    // A binding declared by the learner must be readable by the assertions. If
    // the two halves were ever split into separate functions, this breaks.
    const r = await executeCell(
      'const rows = [{ city: "london" }, { city: "paris" }];\nlet cities = rows.map(r => r.city);',
      'assert(cities.length === 2); assert(cities[0] === "london");',
    );
    expect(r.passed).toBe(true);
  });

  it("fails an unmet assertion with the cell's own message", async () => {
    const r = await executeCell("const total = 4;", 'assert(total === 5, "total should be 5");');
    expect(r.passed).toBe(false);
    expect(r.error).toBe("AssertionError: total should be 5");
  });

  it("reports a crash in the learner's code as itself", async () => {
    const r = await executeCell("const x = null; x.map(v => v);", "assert(true);");
    expect(r.passed).toBe(false);
    expect(r.error).toContain("TypeError");
    expect(r.error).not.toContain("Check failed");
  });

  it("marks a crash in the CHECK half so the learner knows which side broke", async () => {
    // Their code ran fine; they just never created `trimmed`. Reporting a bare
    // ReferenceError would read as their own code throwing.
    const r = await executeCell("const trimmmed = [1];", "assert(trimmed.length === 1);");
    expect(r.passed).toBe(false);
    expect(r.error).toBe("Check failed — ReferenceError: trimmed is not defined");
  });

  it("does not prefix an ordinary assertion failure, which speaks for itself", async () => {
    const r = await executeCell("const a = 1;", "assert(a === 2);");
    expect(r.error).toBe("AssertionError: Assertion failed");
  });

  it("reports a syntax error instead of hanging", async () => {
    const r = await executeCell("const = ;", "assert(true);");
    expect(r.passed).toBe(false);
    expect(r.error).toContain("SyntaxError");
  });

  it("captures console.log into stdout", async () => {
    const r = await executeCell('console.log("hello"); console.log([1, 2]);', "");
    expect(r.passed).toBe(true);
    expect(r.stdout.split("\n")).toEqual(["hello", '{"kind":"value","value":[1,2]}']);
  });

  it("puts the emitted envelope on the LAST stdout line, which is what DrillMock parses", async () => {
    const r = await executeCell(
      'console.log("chatter");\nconst rows = [{ a: 1 }];',
      "__emit(rows);",
    );
    const last = r.stdout.trim().split("\n").pop() as string;
    expect(JSON.parse(last)).toEqual({ kind: "table", rows: [{ a: 1 }] });
  });

  it("shadows the network globals, so a drill cannot come to depend on the network", async () => {
    for (const name of SHADOWED_GLOBALS) {
      const r = await executeCell(`const g = ${name};`, "assert(g === undefined);");
      expect(r.passed).toBe(true);
    }
  });

  it("supports await, so an async pack would not need a runtime rewrite", async () => {
    const r = await executeCell("const v = await Promise.resolve(7);", "assert(v === 7);");
    expect(r.passed).toBe(true);
  });

  it("leaks nothing between runs — each cell gets a fresh scope", async () => {
    await executeCell("var scoped = 1;", "");
    const r = await executeCell("", 'assert(typeof scoped === "undefined");');
    expect(r.passed).toBe(true);
  });
});
