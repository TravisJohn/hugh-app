/**
 * Pure state rules for the Case Lab worked notebook.
 *
 * The whole point of a notebook — and the thing naive implementations get
 * wrong — is that cells share ONE Python namespace. Cell 4 reads variables cell
 * 3 defined. That makes the interesting logic here about *invalidation*, not
 * about running code:
 *
 *   - Running cell i moves the namespace on, so any output already shown for
 *     cells AFTER i was computed against a namespace that no longer exists.
 *     Those outputs are marked `stale` rather than cleared, so the learner can
 *     still read them but is told they may no longer hold.
 *   - Editing cell i does the same from i onwards (i included): its own shown
 *     output no longer corresponds to the code on screen.
 *   - "Run all" walks the cells in order and HALTS at the first error, because
 *     with a shared namespace every later cell would fail on a missing name and
 *     bury the one real error under a pile of NameErrors.
 *
 * No React, no worker, no DOM — see `notebook.test.ts`.
 */

/** Where one cell is in its lifecycle. */
export type CellStatus = "idle" | "running" | "done" | "error" | "stale";

/** The rendered result of running one cell. */
export interface CellOutput {
  /** Anything the cell printed. */
  stdout: string;
  /** The last expression rendered as an HTML table (DataFrame / Series). */
  html: string | null;
  /** The last expression rendered as text, when it isn't tabular. */
  text: string | null;
}

export interface CellState {
  status: CellStatus;
  output: CellOutput | null;
  error: string | null;
}

export const EMPTY_CELL: CellState = { status: "idle", output: null, error: null };

/** A fresh, unrun notebook of `count` cells. */
export function initialCells(count: number): CellState[] {
  return Array.from({ length: count }, () => ({ ...EMPTY_CELL }));
}

/** True once a cell has something worth showing. */
export function hasOutput(cell: CellState): boolean {
  return cell.status === "done" || cell.status === "error" || cell.status === "stale";
}

/**
 * Mark cell `index` as running. Cells after it keep their output for now — it is
 * only invalidated once the run actually lands (see {@link applyResult}), so the
 * page doesn't flicker every cell grey the moment a button is pressed.
 */
export function markRunning(cells: CellState[], index: number): CellState[] {
  return cells.map((cell, i) =>
    i === index ? { status: "running", output: null, error: null } : cell,
  );
}

/** Land a successful run on cell `index`, staling everything downstream. */
export function applyResult(
  cells: CellState[],
  index: number,
  output: CellOutput,
): CellState[] {
  return cells.map((cell, i) => {
    if (i === index) return { status: "done", output, error: null };
    if (i > index && hasOutput(cell)) return { ...cell, status: "stale" };
    return cell;
  });
}

/** Land a failed run on cell `index`, staling everything downstream. */
export function applyError(
  cells: CellState[],
  index: number,
  error: string,
): CellState[] {
  return cells.map((cell, i) => {
    if (i === index) return { status: "error", output: null, error };
    if (i > index && hasOutput(cell)) return { ...cell, status: "stale" };
    return cell;
  });
}

/**
 * The learner edited cell `index`. Its own displayed output no longer matches
 * the code on screen, and neither does anything after it.
 */
export function markEdited(cells: CellState[], index: number): CellState[] {
  return cells.map((cell, i) =>
    i >= index && hasOutput(cell) ? { ...cell, status: "stale" } : cell,
  );
}

/**
 * The Python session was lost (a hung cell forces a worker restart, which takes
 * the namespace with it). Every output is meaningless — back to a clean sheet.
 */
export function resetAll(count: number): CellState[] {
  return initialCells(count);
}

/**
 * The next cell "Run all" should execute after `from`, or null when the walk is
 * over. Returns null at an error so the sequence halts there.
 */
export function nextRunAllIndex(cells: CellState[], from: number): number | null {
  if (from > 0 && cells[from - 1]?.status === "error") return null;
  return from < cells.length ? from : null;
}

/** How far the learner has got — drives the progress line in the header. */
export function runProgress(cells: CellState[]): { done: number; total: number } {
  return {
    done: cells.filter((c) => c.status === "done").length,
    total: cells.length,
  };
}
