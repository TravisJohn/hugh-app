import { describe, it, expect } from "vitest";
import {
  R_PRELUDE,
  R_RESET,
  emitResultR,
  formatRError,
  rValueToEnvelope,
  type RJsValue,
} from "./rRuntime";

// The envelope shaping for R lives in TypeScript rather than in a hand-rolled
// JSON writer in R, precisely so it can be tested here. WebR hands back typed
// vectors and lists; these are the shapes the packs actually produce.

const vec = (type: string, values: unknown[], names?: string[]): RJsValue => ({
  type,
  names: names ?? null,
  values,
});

describe("rValueToEnvelope", () => {
  it("renders a data.frame as a table", () => {
    // WebR gives a data.frame as a list of equal-length columns.
    const df: RJsValue = {
      type: "list",
      names: ["region", "total"],
      values: [vec("character", ["AM", "EU"]), vec("double", [360, 360])],
    };
    expect(rValueToEnvelope(df)).toEqual({
      kind: "table",
      rows: [
        { region: "AM", total: 360 },
        { region: "EU", total: 360 },
      ],
    });
  });

  it("unwraps a length-1 vector, since R has no scalar type", () => {
    // mean(x) comes back as a double vector of one. Showing it as [165] would
    // be technically true and useless.
    expect(rValueToEnvelope(vec("double", [165]))).toEqual({ kind: "value", value: 165 });
  });

  it("keeps a longer vector as an array", () => {
    expect(rValueToEnvelope(vec("character", ["Ann", "Ben"]))).toEqual({
      kind: "value",
      value: ["Ann", "Ben"],
    });
  });

  it("renders a NAMED vector as two columns, not bare numbers", () => {
    // table() and tapply() return these; dropping the names would throw away
    // the half of the result that says what each number counts.
    expect(rValueToEnvelope(vec("integer", [3, 2], ["london", "paris"]))).toEqual({
      kind: "table",
      rows: [
        { name: "london", value: 3 },
        { name: "paris", value: 2 },
      ],
    });
  });

  it("treats R NULL and a missing value alike", () => {
    expect(rValueToEnvelope({ type: "null" })).toEqual({ kind: "value", value: null });
    expect(rValueToEnvelope(null)).toEqual({ kind: "value", value: null });
    expect(rValueToEnvelope(undefined)).toEqual({ kind: "value", value: null });
  });

  it("does not mistake a ragged list for a data.frame", () => {
    // A plain list with uneven elements is not a table; rendering it as one
    // would silently drop values off the short columns.
    const ragged: RJsValue = {
      type: "list",
      names: ["a", "b"],
      values: [vec("double", [1, 2, 3]), vec("double", [1])],
    };
    expect(rValueToEnvelope(ragged).kind).toBe("value");
  });

  it("does not mistake an unnamed list for a data.frame", () => {
    const unnamed: RJsValue = {
      type: "list",
      names: null,
      values: [vec("double", [1]), vec("double", [2])],
    };
    expect(rValueToEnvelope(unnamed).kind).toBe("value");
  });

  it("handles a one-row data.frame, which is still a table", () => {
    const df: RJsValue = {
      type: "list",
      names: ["rep", "revenue"],
      values: [vec("character", ["Dan"]), vec("double", [270])],
    };
    expect(rValueToEnvelope(df)).toEqual({ kind: "table", rows: [{ rep: "Dan", revenue: 270 }] });
  });
});

describe("formatRError", () => {
  it("strips R's 'Error in ...:' wrapper down to the sentence", () => {
    expect(formatRError(new Error("Error in eval(x): object 'total' not found"))).toBe(
      "object 'total' not found",
    );
  });

  it("strips a bare 'Error:' prefix too", () => {
    expect(formatRError(new Error("Error: Assertion failed"))).toBe("Assertion failed");
  });

  it("keeps a message that has no wrapper", () => {
    expect(formatRError(new Error("could not find function \"filter\""))).toBe(
      'could not find function "filter"',
    );
  });

  it("skips R's trailing 'In addition:' noise", () => {
    const err = new Error("In addition: Warning message:\nNAs introduced by coercion");
    expect(formatRError(err)).toBe("NAs introduced by coercion");
  });

  it("never returns an empty string", () => {
    expect(formatRError("")).toBe("Error");
    expect(formatRError(undefined)).toBe("undefined");
  });
});

describe("the R prelude", () => {
  it("defines the same assert name the other languages use", () => {
    // A cell's check reads identically in all four languages; packs.test.ts
    // also requires the literal word "assert" in every non-SQL assertion.
    expect(R_PRELUDE).toContain("assert <- function");
  });

  it("makes assert vector-safe, so a whole-vector comparison must match throughout", () => {
    // Bare `if` on a length-3 logical is an error in modern R, and taking only
    // the first element would pass a cell that is wrong in elements 2 and 3.
    expect(R_PRELUDE).toContain("isTRUE(all(cond))");
  });

  it("parks the preview value instead of serialising it in R", () => {
    expect(R_PRELUDE).toContain(".hugh_result");
    expect(emitResultR("total")).toBe(".hugh_emit(total)");
  });

  it("clears dot-names on reset, so a stale preview cannot survive a cell", () => {
    // Without all.names = TRUE, R hides .hugh_result from ls() and the next
    // cell would preview the previous cell's answer.
    expect(R_RESET).toContain("all.names = TRUE");
  });
});
