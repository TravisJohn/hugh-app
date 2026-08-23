"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initialCells,
  markRunning,
  markEdited,
  applyResult,
  applyError,
  resetAll,
  nextRunAllIndex,
  type CellState,
  type CellOutput,
} from "@/lib/case-lab/notebook";
import { PyodideNotebook, type DatasetSummary } from "@/lib/code/notebookClient";
import type { CaseLabNotebook } from "@/types/case-lab";

/**
 * Owns every piece of worked-notebook state for one Case Lab case: the Python
 * session, the editable cell sources, and each cell's run state.
 *
 * Boot is LAZY and explicit. Pyodide plus pandas is roughly 20MB of CDN
 * download, so nothing is fetched until the learner opens the notebook — a case
 * page that is only read still costs what it always did. Case Lab's zero-runtime-AI,
 * zero-server-cost properties are untouched: the CSV is a static asset and the
 * analysis never leaves the browser.
 */

export type SessionStatus = "closed" | "booting" | "ready" | "failed";

const EMPTY_OUTPUT: CellOutput = { stdout: "", html: null, text: null };

export function useCaseNotebook(notebook: CaseLabNotebook | undefined, csvPath: string) {
  const cellCount = notebook?.cells.length ?? 0;

  const [status, setStatus] = useState<SessionStatus>("closed");
  const [bootError, setBootError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [cells, setCells] = useState<CellState[]>(() => initialCells(cellCount));
  const [code, setCode] = useState<string[]>(() => notebook?.cells.map((c) => c.code) ?? []);
  const [busy, setBusy] = useState(false);

  // Mirrors, so the sequential run-all loop reads current values rather than
  // the ones captured when it started.
  const cellsRef = useRef(cells);
  const codeRef = useRef(code);
  const runnerRef = useRef<PyodideNotebook | null>(null);
  const busyRef = useRef(false);

  const commitCells = useCallback((next: CellState[]) => {
    cellsRef.current = next;
    setCells(next);
  }, []);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // Tear the worker down when the learner leaves the case.
  useEffect(() => {
    return () => {
      runnerRef.current?.destroy();
      runnerRef.current = null;
    };
  }, []);

  /** Fetches the CSV, boots Python, and binds `df`. Idempotent. */
  const open = useCallback(async () => {
    if (status !== "closed" || !notebook) return;
    setStatus("booting");
    setBootError(null);
    try {
      const response = await fetch(csvPath);
      if (!response.ok) throw new Error(`Could not load the dataset (${response.status})`);
      const csv = await response.text();

      const runner = new PyodideNotebook();
      runner.onSessionLost = () => commitCells(resetAll(cellCount));
      runnerRef.current = runner;

      const bound = await runner.init(csv);
      if (bound.rows === 0) throw new Error("The dataset loaded but came back empty");
      setSummary(bound);
      setStatus("ready");
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "Python failed to start");
      setStatus("failed");
    }
  }, [status, notebook, csvPath, cellCount, commitCells]);

  /** Runs one cell in the shared namespace. */
  const runCell = useCallback(
    async (index: number) => {
      const runner = runnerRef.current;
      if (!runner || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      commitCells(markRunning(cellsRef.current, index));
      const result = await runner.runCell(codeRef.current[index] ?? "");
      commitCells(
        result.error
          ? applyError(cellsRef.current, index, result.error)
          : applyResult(cellsRef.current, index, result.output ?? EMPTY_OUTPUT),
      );
      busyRef.current = false;
      setBusy(false);
    },
    [commitCells],
  );

  /** Runs every cell top to bottom, halting at the first error. */
  const runAll = useCallback(async () => {
    const runner = runnerRef.current;
    if (!runner || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    let index = nextRunAllIndex(cellsRef.current, 0);
    while (index !== null) {
      commitCells(markRunning(cellsRef.current, index));
      const result = await runner.runCell(codeRef.current[index] ?? "");
      commitCells(
        result.error
          ? applyError(cellsRef.current, index, result.error)
          : applyResult(cellsRef.current, index, result.output ?? EMPTY_OUTPUT),
      );
      index = nextRunAllIndex(cellsRef.current, index + 1);
    }

    busyRef.current = false;
    setBusy(false);
  }, [commitCells]);

  /** Edits one cell's source; its own output and everything after goes stale. */
  const editCell = useCallback(
    (index: number, next: string) => {
      setCode((prev) => prev.map((value, i) => (i === index ? next : value)));
      commitCells(markEdited(cellsRef.current, index));
    },
    [commitCells],
  );

  /** Puts the notebook back to the authored code with no outputs. */
  const reset = useCallback(() => {
    if (busyRef.current) return;
    setCode(notebook?.cells.map((c) => c.code) ?? []);
    commitCells(resetAll(cellCount));
  }, [notebook, cellCount, commitCells]);

  return {
    status,
    bootError,
    summary,
    cells,
    code,
    busy,
    open,
    runCell,
    runAll,
    editCell,
    reset,
  };
}
