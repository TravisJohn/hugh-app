import { describe, it, expect, vi } from "vitest";
import { deferOrRun, type Scheduler } from "./afterResponse";

/**
 * These tests exist because this is the last step of the money path. Since
 * migration 049 the gate reserves budget up front and the usage write is what
 * converts that reservation into recorded spend — so a write that never lands
 * hands the learner back an allowance they have already spent, and under-reports
 * the real provider bill at the same time.
 */

describe("deferOrRun", () => {
  it("defers the write instead of running it during the request", async () => {
    const task = vi.fn(async () => {});
    const scheduled: Array<() => Promise<void>> = [];
    const schedule: Scheduler = t => { scheduled.push(t); };

    await deferOrRun(schedule, task, () => {});

    // The whole point: handed over, not yet run. Running it here would put the
    // insert back on the request's critical path.
    expect(scheduled).toHaveLength(1);
    expect(task).not.toHaveBeenCalled();

    await scheduled[0]!();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs the write inline when there is no request scope to defer into", async () => {
    const task = vi.fn(async () => {});
    // What Next's after() actually does outside a request scope — a synchronous
    // throw (E468), not a rejected promise.
    const schedule: Scheduler = () => { throw new Error("`after` was called outside a request scope"); };

    await deferOrRun(schedule, task, () => {});

    // Losing the deferral must cost latency, never the row.
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("reports a scheduling failure rather than silently falling back", async () => {
    const onError = vi.fn();
    const boom    = new Error("outside a request scope");
    const schedule: Scheduler = () => { throw boom; };

    await deferOrRun(schedule, vi.fn(async () => {}), onError);

    // Silent fallback would hide the deferral being broken everywhere at once.
    expect(onError).toHaveBeenCalledWith("schedule", boom);
  });

  it("does not run the write twice when scheduling succeeds", async () => {
    const task = vi.fn(async () => {});
    const scheduled: Array<() => Promise<void>> = [];

    await deferOrRun(t => { scheduled.push(t); }, task, () => {});
    await scheduled[0]!();

    // Double-counting spend is as wrong as losing it — record_usage is purely
    // additive, so a second run would bill the learner twice for one call.
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("reports a failing task instead of throwing into the caller's request", async () => {
    const onError = vi.fn();
    const boom    = new Error("insert failed");
    const scheduled: Array<() => Promise<void>> = [];

    await deferOrRun(t => { scheduled.push(t); }, async () => { throw boom; }, onError);

    // Accounting must never fail the request it is accounting for.
    await expect(scheduled[0]!()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith("task", boom);
  });

  it("reports a failing task on the inline path too", async () => {
    const onError = vi.fn();
    const boom    = new Error("insert failed");
    const schedule: Scheduler = () => { throw new Error("outside a request scope"); };

    // Both failures at once — no scope to defer into, and the write fails —
    // still resolves, because the caller is mid-response.
    await expect(
      deferOrRun(schedule, async () => { throw boom; }, onError)
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith("schedule", expect.any(Error));
    expect(onError).toHaveBeenCalledWith("task", boom);
  });

  it("resolves without waiting for a slow write to finish", async () => {
    let released = false;
    const scheduled: Array<() => Promise<void>> = [];

    await deferOrRun(
      t => { scheduled.push(t); },
      () => new Promise<void>(resolve => { setTimeout(() => { released = true; resolve(); }, 50); }),
      () => {},
    );

    // Awaiting deferOrRun means "scheduled", not "written" — the timing
    // contract logUsage's callers depend on.
    expect(released).toBe(false);
    expect(scheduled).toHaveLength(1);
  });
});
