import type { RunResult } from "@/types/code";

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
  | { type: "result"; id: number; passed: boolean; stdout: string; error: string | null };

/** Max wall-clock for a single run before we assume an infinite loop. */
const EXEC_TIMEOUT_MS = 6000;

interface PendingRun {
  resolve: (r: RunResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PyodideRunner {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((e: Error) => void) | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRun>();

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
    // type === "result"
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(msg.id);
    entry.resolve({ passed: msg.passed, stdout: msg.stdout, error: msg.error });
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

  /** Terminates a hung worker and boots a fresh one (Pyodide reloads). */
  private hardReset(): void {
    this.worker?.terminate();
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.spawn();
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }
}
