// ── Pure logic behind the JavaScript drill runtime ──────────────────────────
//
// Split out of js.worker.ts so it can be unit-tested without a Worker or a DOM.
// The worker is deliberately thin: it owns the message plumbing and the
// `new Function` call, and every decision with branching in it lives here.
//
// JavaScript is the one drill language whose runtime is already in the browser
// — no Pyodide, no DuckDB-wasm, nothing fetched from a CDN. That makes the
// runner cheap, but it does NOT make the learner's code privileged: cells run
// inside a Worker with the network globals shadowed (see SHADOWED_GLOBALS), so
// a drill cannot quietly come to depend on something it can't reach offline.
// This is an honesty boundary, not a security one — it is the learner's own
// code in the learner's own browser.

/** The shared result envelope DrillMock's parseResult understands. */
export type JsEnvelope =
  | { kind: "table"; rows: Record<string, unknown>[] }
  | { kind: "value"; value: unknown };

/**
 * Globals shadowed to `undefined` inside a cell.
 *
 * Shadowed as FUNCTION PARAMETERS rather than deleted off the worker's
 * globalThis: parameters are lexical, so they can't leak between runs and can't
 * break the worker itself (which still needs postMessage). Reaching for any of
 * these throws a plain "fetch is not a function", which is the correct lesson —
 * a fluency drill has no business calling the network.
 */
export const SHADOWED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "EventSource",
] as const;

/** True for a plain `{}`-ish object — not null, not an array, not a Date/Map/Set. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Shape a cell's result value into the envelope.
 *
 * The rule mirrors the Python probe in DrillMock: something that IS a table
 * renders as a table, everything else renders as a compact value chip. An array
 * of plain objects is the JS equivalent of a DataFrame, so it becomes rows.
 *
 * Set and Map get explicit handling because they're idiomatic in the shaping
 * packs (`new Set(...)` to dedupe, `Map` to count) and would otherwise
 * JSON.stringify to a useless `{}`.
 */
export function toEnvelope(v: unknown): JsEnvelope {
  if (v === undefined || v === null) return { kind: "value", value: null };

  // Sets are unordered; sort by string for a stable, comparable preview.
  if (v instanceof Set) {
    return { kind: "value", value: [...v].sort((a, b) => String(a).localeCompare(String(b))) };
  }

  if (v instanceof Map) {
    const entries = [...v.entries()];
    const allPrimitive = entries.every(([, val]) => val === null || typeof val !== "object");
    if (allPrimitive) {
      return { kind: "table", rows: entries.map(([key, value]) => ({ key: String(key), value })) };
    }
    return { kind: "value", value: Object.fromEntries(entries.map(([k, val]) => [String(k), val])) };
  }

  if (Array.isArray(v) && v.length > 0 && v.every(isPlainObject)) {
    return { kind: "table", rows: v as Record<string, unknown>[] };
  }

  return { kind: "value", value: v };
}

/**
 * JSON for the envelope, total over values JSON.stringify would choke on or
 * silently drop. `default=str` in the Python probe is the same idea: a preview
 * must never be the reason a passing cell looks broken.
 */
export function serializeEnvelope(env: JsEnvelope): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(env, (_key, value: unknown) => {
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
    if (typeof value === "symbol") return String(value);
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Set) return [...value];
    if (value instanceof Map) return Object.fromEntries(value);
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

/**
 * A one-line error message for the drill's error strip.
 *
 * Python tracebacks need their last line pulled out; JS errors are already
 * short, but the NAME carries most of the teaching ("ReferenceError: total is
 * not defined" tells the learner they never created it), so it is kept.
 */
export function formatJsError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name || "Error";
    const message = (err.message || "").trim().split("\n")[0];
    return message ? `${name}: ${message}` : name;
  }
  const text = String(err).trim().split("\n").filter(Boolean)[0];
  return text || "Error";
}

/**
 * The source run inside the cell's function body.
 *
 * `code` and `check` are CONCATENATED into one body rather than run as two
 * separate functions, because they have to share scope: the learner writes
 * `const trimmed = …` and the assertions read `trimmed`. A `try { code }` wrapper
 * would give the right error attribution but block-scope every `const` and `let`
 * away from the assertions, so the phase is tracked by a side-effecting call
 * between the two halves instead. Whatever throws, __phase says which half it
 * was in.
 */
export function buildCellSource(code: string, check: string): string {
  return `"use strict";\n${code}\n;__phase("check");\n${check}\n`;
}

/** Thrown by the injected `assert`, so a failed check reads differently to a crash. */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

/** What one cell run produced. Mirrors RunResult without pulling in its module. */
export interface CellOutcome {
  passed: boolean;
  stdout: string;
  error: string | null;
}

// Async so a pack can `await` one day without a runtime rewrite. Nothing today
// needs it, and it costs nothing: a synchronous body just resolves immediately.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/**
 * Execute one cell: the learner's `code`, then `check` in the same scope.
 *
 * Lives here rather than in the worker so the tests exercise the REAL execution
 * path — scope sharing, assert, the shadowed globals, error attribution — with
 * no Worker involved. The worker is then only message plumbing, and there is no
 * second copy of these semantics to drift out of step.
 *
 * This is not a sandbox and cannot be one: `new Function` compiles in the
 * caller's realm. Isolation comes from the Worker the caller runs it in, and
 * from the fact that it is the learner's own code. See SHADOWED_GLOBALS.
 */
export async function executeCell(code: string, check: string): Promise<CellOutcome> {
  const out: string[] = [];
  const log = (...args: unknown[]) =>
    out.push(
      args.map(a => (typeof a === "string" ? a : serializeEnvelope(toEnvelope(a)))).join(" "),
    );

  // Which half is executing, so a throw can be attributed. Held in an object
  // because it is written from inside the injected callback — a plain `let`
  // would be narrowed to its initial value by the time the catch reads it.
  const state: { phase: "run" | "check" } = { phase: "run" };

  const consoleShim = { log, warn: log, error: log, info: log, debug: log };
  const emit = (v: unknown) => out.push(serializeEnvelope(toEnvelope(v)));
  const assert = (condition: unknown, message?: string) => {
    if (!condition) throw new AssertionError(message ?? "Assertion failed");
  };

  let passed = false;
  let error: string | null = null;

  try {
    const params = ["console", "assert", "__emit", "__phase", ...SHADOWED_GLOBALS];
    const fn = new AsyncFunction(...params, buildCellSource(code, check));
    await fn(
      consoleShim,
      assert,
      emit,
      (p: string) => { state.phase = p === "check" ? "check" : "run"; },
      // Every shadowed global arrives as undefined — see SHADOWED_GLOBALS.
      ...SHADOWED_GLOBALS.map(() => undefined),
    );
    passed = true;
  } catch (err) {
    // Attribute the throw. An AssertionError speaks for itself, but a CRASH in
    // the check half ("ReferenceError: trimmed is not defined") means the
    // learner's code ran fine and simply never created the binding the cell
    // asked for — a different lesson from their code throwing, and worth saying
    // out loud rather than leaving them to guess which half broke.
    const text = formatJsError(err);
    error =
      state.phase === "check" && !text.startsWith("AssertionError")
        ? `Check failed — ${text}`
        : text;
  }

  return { passed, stdout: out.join("\n").trimEnd(), error };
}
