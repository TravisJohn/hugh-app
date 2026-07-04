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
