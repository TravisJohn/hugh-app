import { describe, it, expect } from "vitest";
import {
  initialCells,
  markRunning,
  applyResult,
  applyError,
  markEdited,
  resetAll,
  nextRunAllIndex,
  runProgress,
  hasOutput,
  type CellOutput,
} from "./notebook";

const out = (stdout: string): CellOutput => ({ stdout, html: null, text: null });

/** Convenience: a notebook where the first `n` cells have already succeeded. */
function ranThrough(total: number, n: number) {
  let cells = initialCells(total);
  for (let i = 0; i < n; i++) cells = applyResult(cells, i, out(`cell ${i}`));
  return cells;
}

describe("initialCells", () => {
  it("starts every cell idle with nothing to show, so a fresh notebook renders no output", () => {
    const cells = initialCells(3);
    expect(cells).toHaveLength(3);
    expect(cells.every((c) => c.status === "idle" && c.output === null)).toBe(true);
  });

  it("gives each cell its own object so updating one never mutates its neighbours", () => {
    const cells = initialCells(2);
    expect(cells[0]).not.toBe(cells[1]);
  });
});

describe("running a cell", () => {
  it("clears the cell's previous output while it runs, so stale numbers aren't shown as live", () => {
    const cells = markRunning(applyResult(initialCells(2), 0, out("old")), 0);
    expect(cells[0].status).toBe("running");
    expect(cells[0].output).toBeNull();
  });

  it("leaves later cells untouched while running, so the page doesn't flicker on every click", () => {
    const cells = markRunning(ranThrough(3, 3), 0);
    expect(cells[1].status).toBe("done");
    expect(cells[2].status).toBe("done");
  });

  it("records stdout and marks the cell done", () => {
    const cells = applyResult(initialCells(2), 0, out("12000 rows"));
    expect(cells[0].status).toBe("done");
    expect(cells[0].output?.stdout).toBe("12000 rows");
    expect(cells[0].error).toBeNull();
  });

  it("keeps an HTML table separate from plain text so a DataFrame renders as a table", () => {
    const cells = applyResult(initialCells(1), 0, {
      stdout: "",
      html: "<table></table>",
      text: null,
    });
    expect(cells[0].output?.html).toBe("<table></table>");
    expect(cells[0].output?.text).toBeNull();
  });

  it("drops the previous output when the cell errors, so no half-truth is left on screen", () => {
    let cells = applyResult(initialCells(1), 0, out("fine"));
    cells = applyError(cells, 0, "NameError: df");
    expect(cells[0].status).toBe("error");
    expect(cells[0].output).toBeNull();
    expect(cells[0].error).toBe("NameError: df");
  });
});

describe("shared-namespace invalidation", () => {
  it("stales every later cell when an earlier one is re-run, because the namespace moved under them", () => {
    let cells = ranThrough(4, 4);
    cells = applyResult(cells, 1, out("re-run"));
    expect(cells.map((c) => c.status)).toEqual(["done", "done", "stale", "stale"]);
  });

  it("stales later cells on an error too — a failed run still mutated the namespace", () => {
    let cells = ranThrough(3, 3);
    cells = applyError(cells, 0, "boom");
    expect(cells.map((c) => c.status)).toEqual(["error", "stale", "stale"]);
  });

  it("never stales a cell that was never run, so untouched cells stay plainly idle", () => {
    let cells = ranThrough(3, 1);
    cells = applyResult(cells, 0, out("again"));
    expect(cells.map((c) => c.status)).toEqual(["done", "idle", "idle"]);
  });

  it("stales the edited cell itself, since its shown output no longer matches its code", () => {
    let cells = ranThrough(3, 3);
    cells = markEdited(cells, 1);
    expect(cells.map((c) => c.status)).toEqual(["done", "stale", "stale"]);
  });

  it("editing a cell that was never run changes nothing", () => {
    const cells = markEdited(initialCells(3), 1);
    expect(cells.every((c) => c.status === "idle")).toBe(true);
  });

  it("wipes everything when the Python session is lost, because no output survives a restart", () => {
    const cells = resetAll(ranThrough(3, 3).length);
    expect(cells.every((c) => c.status === "idle" && c.output === null)).toBe(true);
  });
});

describe("run all", () => {
  it("walks the cells in order from the top", () => {
    const cells = initialCells(3);
    expect(nextRunAllIndex(cells, 0)).toBe(0);
    expect(nextRunAllIndex(applyResult(cells, 0, out("")), 1)).toBe(1);
  });

  it("stops after the last cell", () => {
    expect(nextRunAllIndex(ranThrough(2, 2), 2)).toBeNull();
  });

  it("halts at the first error, so one real failure isn't buried under NameErrors downstream", () => {
    const cells = applyError(initialCells(3), 0, "SyntaxError");
    expect(nextRunAllIndex(cells, 1)).toBeNull();
  });
});

describe("progress and output presence", () => {
  it("counts only cells that actually succeeded", () => {
    let cells = ranThrough(4, 2);
    cells = applyError(cells, 2, "boom");
    expect(runProgress(cells)).toEqual({ done: 2, total: 4 });
  });

  it("treats stale cells as still having something to show", () => {
    const cells = markEdited(ranThrough(2, 2), 0);
    expect(hasOutput(cells[0])).toBe(true);
    expect(hasOutput(initialCells(1)[0])).toBe(false);
  });
});
