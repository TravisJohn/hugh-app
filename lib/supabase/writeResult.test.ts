import { describe, it, expect } from "vitest";
import { writeOutcome } from "./writeResult";

describe("writeOutcome - a null error does not mean a row changed", () => {
  it("reports a write that matched no rows as a failure, not a success", () => {
    // The whole module in one assertion. This is what an RLS denial looks like
    // from the route's side: no error, no data, nothing written, nobody told.
    const out = writeOutcome({ error: null, data: null });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("no-row");
  });

  it("reports an empty array the same way as a null row", () => {
    // `.select()` without `.single()` answers with an array. An empty one is
    // the same non-event, and must not read as success just for having a shape.
    const out = writeOutcome({ error: null, data: [] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("no-row");
  });

  it("treats a missing data key as no row rather than assuming the best", () => {
    const out = writeOutcome({ error: null, data: undefined });
    expect(out.ok).toBe(false);
  });
});

describe("writeOutcome - the reply the database did complain about", () => {
  it("reports an explicit error as rejected and keeps its message", () => {
    const out = writeOutcome({ error: { message: "deadlock detected" }, data: null });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("rejected");
      expect(out.message).toBe("deadlock detected");
    }
  });

  it("prefers the error over the row count when both look wrong", () => {
    // An error with rows attached is still an error; the database's own
    // complaint is more specific than our inference from an empty result.
    const out = writeOutcome({ error: { message: "constraint violated" }, data: [{ id: "m1" }] });
    if (!out.ok) expect(out.reason).toBe("rejected");
  });
});

describe("writeOutcome - the writes that did happen", () => {
  it("accepts a single returned row", () => {
    expect(writeOutcome({ error: null, data: { id: "m1" } })).toEqual({ ok: true });
  });

  it("accepts a non-empty array of returned rows", () => {
    expect(writeOutcome({ error: null, data: [{ id: "m1" }, { id: "m2" }] })).toEqual({ ok: true });
  });
});
