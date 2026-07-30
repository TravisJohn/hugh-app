import type { DrillRunner, RunResult } from "@/types/code";

/**
 * Main-thread wrapper around the Pyodide worker. Owns the worker lifecycle,
 * correlates run requests by id, and enforces a hard execution timeout: if
 * learner code hangs (infinite loop), the worker is terminated and respawned so
 * the page stays responsive.
 *
 * Browser-only — never import this from a server component or API route.
 */

type WorkerMessage =
  | { type: "ready" }
  | { type: "init-error"; error: string }
  | { type: "preloaded"; id: number; error: string | null }
  | { type: "result"; id: number; passed: boolean; stdout: string; error: string | null };

// Max wall-clock for a single run before we assume an infinite loop. 6s was
// enough for pandas-only cells, but scikit-learn cells (model packs) measured
// ~9s per run even with pandas/scikit-learn already preloaded — re-scanning
// imports plus real fit/predict calls costs more than a pandas aggregation.
// Undersizing this is worse than it looks: a timed-out run leaves the worker
// mid-reset, so the NEXT run has to reload every package from scratch too —
// which almost certainly times out again, in a loop that never recovers.
const EXEC_TIMEOUT_MS = 15000;

interface PendingRun {
  resolve: (r: RunResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PyodideRunner implements DrillRunner {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((e: Error) => void) | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRun>();
  private preloads = new Map<number, () => void>();
  private lastPreload: string[] = [];

  /** Boots the worker + Pyodide. Idempotent — returns the same promise. */
  init(): Promise<void> {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("PyodideRunner is browser-only"));
    }
    if (this.readyPromise) return this.readyPromise;
    this.spawn();
    return this.readyPromise!;
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

  private onMessage(msg: WorkerMessage): void {
    if (msg.type === "ready") {
      this.resolveReady?.();
      return;
    }
    if (msg.type === "init-error") {
      this.rejectReady?.(new Error(msg.error));
      return;
    }
    if (msg.type === "preloaded") {
      const resolve = this.preloads.get(msg.id);
      if (resolve) { this.preloads.delete(msg.id); resolve(); }
      return;
    }
    // type === "result"
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(msg.id);
    entry.resolve({ passed: msg.passed, stdout: msg.stdout, error: msg.error });
  }

  /**
   * Loads heavy packages (e.g. pandas) into the worker up front. Done outside
   * the per-run timeout so a multi-second first download can't be killed as a
   * "hung" run. Safe to call before the first cell; a no-op if packages is empty.
   */
  async preload(packages: string[]): Promise<void> {
    await this.init();
    this.lastPreload = packages; // remembered so a hard reset can restore it
    if (packages.length === 0) return;
    const id = this.nextId++;
    return new Promise<void>((resolve) => {
      this.preloads.set(id, resolve);
      this.worker?.postMessage({ type: "preload", id, packages });
    });
  }

  /** Runs learner code then assertions; resolves with the outcome. */
  async run(code: string, assertions: string): Promise<RunResult> {
    await this.init();
    const id = this.nextId++;
    return new Promise<RunResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.hardReset();
        resolve({
          passed: false,
          stdout: "",
          error: "Execution timed out — possible infinite loop.",
        });
      }, EXEC_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      this.worker?.postMessage({ type: "run", id, code, assertions });
    });
  }

  /**
   * Terminates a hung worker and boots a fresh one (Pyodide reloads). The new
   * worker starts with nothing loaded, so without re-preloading, the very next
   * run would have to load every package from scratch inside ITS OWN timeout —
   * for a heavy pack (pandas/scikit-learn) that reliably times out too, in a
   * loop that never recovers. Re-issuing the last preload (fire-and-forget,
   * outside any run's timeout) is what breaks that loop.
   */
  private hardReset(): void {
    this.worker?.terminate();
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.preloads.clear();
    this.spawn();
    if (this.lastPreload.length) void this.preload(this.lastPreload);
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.preloads.clear();
  }
}
