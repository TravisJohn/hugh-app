import type { CellOutput } from "@/lib/case-lab/notebook";

/**
 * Main-thread wrapper around the Pyodide worker's SESSION mode — the Case Lab
 * worked notebook.
 *
 * It shares `pyodide.worker.ts` with the drill runner rather than forking a
 * second worker file, so the fiddly parts (timeout, terminate-and-respawn) exist
 * in one place. The difference is the namespace: drills get a fresh one per run,
 * a notebook keeps one for the whole session.
 *
 * That shared namespace is also the thing that makes a timeout expensive here.
 * Killing a hung worker takes the namespace with it — every variable the learner
 * built up is gone, not just the offending cell. So a reset is reported to the
 * caller via `onSessionLost` instead of being papered over: the UI clears every
 * output and says the session restarted, because silently continuing against an
 * empty namespace would make cell 4 fail with a baffling NameError.
 *
 * Browser-only — never import from a server component or API route.
 */

type WorkerMessage =
  | { type: "ready" }
  | { type: "init-error"; error: string }
  | { type: "session-ready"; id: number; error: string | null; summary: string | null }
  | { type: "cell-result"; id: number; payload: string | null; error: string | null };

/** What the session knows about the bound dataset once `df` exists. */
export interface DatasetSummary {
  rows: number;
  columns: string[];
}

export interface CellRunResult {
  output: CellOutput | null;
  error: string | null;
}

// A cell over 12k rows of pandas runs in well under a second; this is an
// infinite-loop guard, not a budget. Generous because the cost of tripping it
// is losing the whole namespace, not just re-running one cell.
const CELL_TIMEOUT_MS = 20000;

interface Pending<T> {
  resolve: (value: T) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export class PyodideNotebook {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((e: Error) => void) | null = null;
  private nextId = 1;
  private cells = new Map<number, Pending<CellRunResult>>();
  private sessions = new Map<number, Pending<DatasetSummary>>();
  private csv: string | null = null;

  /** Called when a hung cell forced a restart and the namespace was lost. */
  onSessionLost: (() => void) | null = null;

  /**
   * Boots Pyodide, loads pandas/numpy, and binds `csv` as `df`. All of it runs
   * outside any per-cell timeout, because the first-visit package download is
   * measured in seconds and must never be mistaken for a hung cell.
   */
  async init(csv: string): Promise<DatasetSummary> {
    if (typeof window === "undefined") {
      throw new Error("PyodideNotebook is browser-only");
    }
    this.csv = csv;
    if (!this.readyPromise) this.spawn();
    await this.readyPromise;
    return this.bind();
  }

  private spawn(): void {
    this.worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url));
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => this.onMessage(e.data);
    this.worker.onerror = () => this.rejectReady?.(new Error("Worker failed to load"));
  }

  /**
   * Sends the CSV to the worker and waits for `df` to exist. A failed bind
   * resolves with zero rows rather than rejecting — the caller treats that as
   * "unusable" and shows a message, and there is no unhandled rejection to
   * chase if the worker dies mid-boot.
   */
  private bind(): Promise<DatasetSummary> {
    const id = this.nextId++;
    return new Promise<DatasetSummary>((resolve) => {
      this.sessions.set(id, { resolve, timer: null });
      this.worker?.postMessage({ type: "session-init", id, csv: this.csv });
    });
  }

  private onMessage(msg: WorkerMessage): void {
    if (msg.type === "ready") {
      this.resolveReady?.();
      return;
    }
    if (msg.type === "init-error") {
      this.rejectReady?.(new Error(msg.error));
      return;
    }
    if (msg.type === "session-ready") {
      const pending = this.sessions.get(msg.id);
      if (!pending) return;
      this.sessions.delete(msg.id);
      pending.resolve(parseSummary(msg.summary));
      return;
    }
    // type === "cell-result"
    const pending = this.cells.get(msg.id);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.cells.delete(msg.id);
    pending.resolve({
      output: msg.error ? null : parseOutput(msg.payload),
      error: msg.error,
    });
  }

  /** Runs one cell in the shared namespace. */
  runCell(code: string): Promise<CellRunResult> {
    if (!this.worker) {
      return Promise.resolve({ output: null, error: "Python session is not running." });
    }
    const id = this.nextId++;
    return new Promise<CellRunResult>((resolve) => {
      const timer = setTimeout(() => {
        this.cells.delete(id);
        this.restart();
        resolve({
          output: null,
          error:
            "That cell ran too long and was stopped — the Python session restarted, so run from the top.",
        });
      }, CELL_TIMEOUT_MS);
      this.cells.set(id, { resolve, timer });
      this.worker?.postMessage({ type: "cell", id, code });
    });
  }

  /**
   * Terminates a hung worker, boots a fresh one, and re-binds the CSV so the
   * learner can carry on from cell 1 rather than from a broken session.
   */
  private restart(): void {
    this.worker?.terminate();
    this.clearPending();
    this.spawn();
    if (this.csv !== null) {
      void this.readyPromise?.then(() => this.bind()).catch(() => {});
    }
    this.onSessionLost?.();
  }

  private clearPending(): void {
    for (const { timer } of this.cells.values()) if (timer) clearTimeout(timer);
    this.cells.clear();
    this.sessions.clear();
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.csv = null;
    this.onSessionLost = null;
    this.clearPending();
  }
}

/** The worker hands back JSON strings; a malformed one must not crash the page. */
function parseSummary(raw: string | null): DatasetSummary {
  if (!raw) return { rows: 0, columns: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<DatasetSummary>;
    return {
      rows: typeof parsed.rows === "number" ? parsed.rows : 0,
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
    };
  } catch {
    return { rows: 0, columns: [] };
  }
}

function parseOutput(raw: string | null): CellOutput | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CellOutput>;
    return {
      stdout: typeof parsed.stdout === "string" ? parsed.stdout : "",
      html: typeof parsed.html === "string" ? parsed.html : null,
      text: typeof parsed.text === "string" ? parsed.text : null,
    };
  } catch {
    return null;
  }
}
