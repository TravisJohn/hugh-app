// Types for the isolated "Hugh Code" playground (Python-only, client-side).
// Kept in its own file so the coding experiment stays decoupled from the
// interview/learning types in `types/index.ts`.

/**
 * A single rung on the escalating coding ladder. Each task is fully authored:
 * the prompt the learner reads, the code their editor starts with, the hidden
 * assertions that verify a pass, and the solution Hugh ghost-types alongside.
 */
export interface CodeTask {
  id: string;
  title: string;
  /** Instruction shown to the learner. Keep it to one or two short sentences. */
  prompt: string;
  /** Pre-filled editor content (often a comment placeholder). */
  starterCode: string;
  /** The reference solution Hugh types out as a pacer/demo. */
  hughSolution: string;
  /**
   * Python source run *after* the learner's code in the same namespace.
   * Any raised exception (e.g. a failed `assert`) marks the rung failed.
   */
  assertions: string;
  /** Per-rung countdown. Defaults to DEFAULT_TIMER_SECONDS when omitted. */
  timerSeconds?: number;
}

/** The strict state machine for a playground run. */
export type LadderState =
  | "LOADING_RUNTIME" // Pyodide booting in the worker
  | "READY" // rung loaded, waiting for the learner to begin
  | "RACING" // timer counting down, Hugh typing, learner editing
  | "CHECKING" // user code + assertions executing in the worker
  | "PASS" // rung cleared, brief celebration before advancing
  | "GAME_OVER" // timer expired without a pass — ladder resets
  | "WON"; // every rung cleared — run complete

/** Outcome of running learner code + assertions in the worker. */
export interface RunResult {
  passed: boolean;
  /** Captured stdout from the learner's program. */
  stdout: string;
  /** Error text when execution or an assertion fails; null on success. */
  error: string | null;
}

/**
 * The languages a drill can be authored in, each backed by its own runtime.
 *
 * This array is the SINGLE SOURCE OF TRUTH — `DrillLang` is derived from it,
 * and the tests that must cover "every language" iterate it rather than a
 * literal tuple. That matters: when the list was written out by hand in each
 * test, adding a language silently skipped it everywhere, so a new language
 * could ship without ever being checked against the leaf budget or the
 * every-pack-is-filed guard.
 *
 * Order is the order the pills render in.
 */
export const DRILL_LANGS = ["python", "sql", "javascript"] as const;

export type DrillLang = (typeof DRILL_LANGS)[number];

/**
 * The uniform contract every drill runtime satisfies, so DrillMock can drive
 * Python (Pyodide) or SQL (DuckDB-wasm) through one code path. `run` executes
 * `code` then validates it with `check`:
 *  - Python: `check` is assert code run in the same namespace (raises → fail).
 *  - SQL: `check` is the expected result set as JSON (deep-equal → pass); an
 *    empty `check` just runs `code` and returns its result table (used to
 *    precompute the "Produces" panel).
 * Either way `stdout` carries the result as the shared `{kind,…}` envelope.
 */
export interface DrillRunner {
  init(): Promise<void>;
  run(code: string, check: string): Promise<RunResult>;
  destroy(): void;
}
