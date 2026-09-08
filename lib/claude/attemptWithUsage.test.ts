import { describe, it, expect } from "vitest";
import { attemptWithUsage, wasBilled } from "./attemptWithUsage";

const usage = (tokensIn: number, tokensOut: number) => ({ tokensIn, tokensOut });

describe("attemptWithUsage - a discarded attempt still costs money", () => {
  it("reports usage from an attempt that billed and then threw", () => {
    // The defect this module exists for. The model answered — so we were
    // charged — and the parse on the next line blew up. The tokens are real.
    return attemptWithUsage(1, async report => {
      report(usage(900, 40));
      throw new Error("Unexpected token < in JSON");
    }).then(out => {
      expect(out.ok).toBe(false);
      expect(out.usage).toEqual(usage(900, 40));
    });
  });

  it("sums every attempt when all of them fail", async () => {
    // Two Sonnet calls carrying a whole document. Losing this was losing the
    // more expensive half of the request.
    const out = await attemptWithUsage(2, async report => {
      report(usage(1_000, 50));
      throw new Error("bad json");
    });
    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(2);
    expect(out.usage).toEqual(usage(2_000, 100));
  });

  it("keeps the cost of a failed first attempt when a later one succeeds", async () => {
    let call = 0;
    const out = await attemptWithUsage(2, async report => {
      call += 1;
      report(usage(500, 20));
      if (call === 1) throw new Error("transient");
      return "a topic";
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toBe("a topic");
    // 500 + 500, not just the attempt we kept.
    expect(out.usage).toEqual(usage(1_000, 40));
    expect(out.attempts).toBe(2);
  });

  it("reports nothing billed when the call never reached the model", async () => {
    const out = await attemptWithUsage(2, async () => {
      throw new Error("connection refused");
    });
    expect(out.usage).toEqual(usage(0, 0));
    expect(wasBilled(out.usage)).toBe(false);
  });
});

describe("attemptWithUsage - stopping and starting", () => {
  it("stops at the first success rather than using its whole allowance", async () => {
    let calls = 0;
    const out = await attemptWithUsage(3, async report => {
      calls += 1;
      report(usage(10, 1));
      return "done";
    });
    expect(calls).toBe(1);
    expect(out.attempts).toBe(1);
    expect(out.usage).toEqual(usage(10, 1));
  });

  it("still runs once when asked for zero or fewer attempts", async () => {
    // A mis-configured retry count should not silently disable a feature.
    let calls = 0;
    const out = await attemptWithUsage(0, async () => { calls += 1; return "ran"; });
    expect(calls).toBe(1);
    expect(out.ok).toBe(true);
  });

  it("carries the last error out, not the first", async () => {
    let call = 0;
    const out = await attemptWithUsage(2, async () => {
      call += 1;
      throw new Error(call === 1 ? "first" : "second");
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect((out.error as Error).message).toBe("second");
  });

  it("never returns a null error on the failure path", async () => {
    // A caller logging `out.error` must always have something to log.
    const out = await attemptWithUsage(1, async () => { throw null; });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBeInstanceOf(Error);
  });
});

describe("wasBilled", () => {
  it("counts output-only and input-only spend as billed", () => {
    expect(wasBilled(usage(0, 5))).toBe(true);
    expect(wasBilled(usage(5, 0))).toBe(true);
  });

  it("is false only when nothing was spent at all", () => {
    expect(wasBilled(usage(0, 0))).toBe(false);
  });
});
