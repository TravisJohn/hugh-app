import type { DrillRunner, RunResult } from "@/types/code";

/**
 * Main-thread wrapper around the JavaScript drill worker — the JS counterpart
 * to PyodideRunner and DuckDBRunner, satisfying the same DrillRunner contract
 * so DrillMock drives all three through one code path.
 *
 * The contract maps onto JS exactly as it does onto Python: `check` is
 * assertion source run in the LEARNER'S OWN SCOPE (an injected `assert` throws
 * on failure), not an expected result set the way SQL's is.
 *
 * Browser-only — never import this from a server component or API route.
 */

type WorkerMessage =
  | { type: "ready" }
  | { type: "result"; id: number; passed: boolean; stdout: string; error: string | null };

/**
 * Max wall-clock for one cell before we assume a runaway loop.
 *
 * Far tighter than PyodideRunner's 15s, and deliberately so: that budget is
 * almost entirely package loading, and this runtime has none — no wasm, no CDN,
 * no imports. A JS cell that hasn't finished shaping six rows in five seconds
 * is looping, so failing fast is the honest answer. A hard reset here is also
 * nearly free, unlike Pyodide's, where it means reloading pandas.
 */
const EXEC_TIMEOUT_MS = 5000;

interface PendingRun {
  resolve: (r: RunResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class JsRunner implements DrillRunner {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((e: Error) => void) | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRun>();

  /** Boots the worker. Idempotent — returns the same promise. */
  init(): Promise<void> {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("JsRunner is browser-only"));
    }
    if (this.readyPromise) return this.readyPromise;
    this.spawn();
    return this.readyPromise!;
  }

  private spawn(): void {
    // A module worker, so it can import the pure logic in jsRuntime.ts rather
    // than carry a second copy of it.
    this.worker = new Worker(new URL("./js.worker.ts", import.meta.url), { type: "module" });
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
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(msg.id);
    entry.resolve({ passed: msg.passed, stdout: msg.stdout, error: msg.error });
  }

  /** Runs learner code then assertions in the same scope; resolves the outcome. */
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
   * Kills a hung worker and boots a fresh one. Cheap here — the replacement is
   * ready on its first tick, so unlike Pyodide there is nothing to restore and
   * no risk of the next run timing out inside its own boot.
   */
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
