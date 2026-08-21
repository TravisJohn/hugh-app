// ── Pure logic behind the R drill runtime ──────────────────────────────────
//
// Split out of rClient.ts so it can be unit-tested without WebR, a Worker or a
// browser. The client owns the WebR lifecycle; every decision with branching in
// it lives here.
//
// R is the heaviest of Hugh's four drill runtimes and the only one whose cost
// was measured before it was built. In real Chrome, cold cache, no
// cross-origin isolation: 4.2s and 11.9MB to a runnable base-R cell, 15.6s and
// 19.6MB once dplyr and its 16 dependencies are installed. That is why the
// dplyr packs declare `preloadPackages` and the base-R pack does not — a
// learner drilling vectors should not pay for tidyverse.

/** The shared result envelope DrillMock's parseResult understands. */
export type REnvelope =
  | { kind: "table"; rows: Record<string, unknown>[] }
  | { kind: "value"; value: unknown };

/**
 * What WebR's `.toJs()` hands back for an R object: a typed vector, or a list
 * (which is what a data.frame is) whose values are themselves such objects.
 */
export interface RJsValue {
  type: string;
  names?: string[] | null;
  values?: unknown[];
}

/**
 * R source prepended to every run.
 *
 * `assert` deliberately shadows nothing in base R and reads the same as the
 * Python and JavaScript packs' assert, so a cell's check looks the same in all
 * three languages. `isTRUE(all(...))` makes a vectorised comparison behave:
 * `assert(x == c(1,2,3))` should pass only when every element matches, and R's
 * bare `if` on a length-3 logical is an error in modern R anyway.
 *
 * `.hugh_emit` does NOT serialise. It parks the value in the global
 * environment and the client converts it with WebR's own `.toJs()`, so the
 * envelope shaping stays in TypeScript where rValueToEnvelope tests it —
 * rather than becoming a hand-rolled JSON writer in R that nothing checks.
 */
export const R_PRELUDE: string = [
  'assert <- function(cond, msg = "Assertion failed") {',
  "  if (!isTRUE(all(cond))) stop(msg, call. = FALSE)",
  "  invisible(TRUE)",
  "}",
  ".hugh_emit <- function(x) {",
  '  assign(".hugh_result", x, envir = globalenv())',
  "  invisible(NULL)",
  "}",
].join("\n");

/**
 * Wipes user bindings between cells, so one cell's variables can never satisfy
 * the next cell's assertions. The Pyodide runner gets this free by building a
 * fresh namespace per attempt; WebR has one persistent global environment, so
 * it has to be asked. `all.names = TRUE` matters: without it R hides anything
 * beginning with a dot, and `.hugh_result` would survive to preview a stale
 * value on a cell that produced nothing.
 */
export const R_RESET: string = "rm(list = ls(envir = globalenv(), all.names = TRUE), envir = globalenv())";

/** True for a WebR list whose columns are equal-length vectors — i.e. a data.frame. */
function isColumnar(v: RJsValue): boolean {
  if (v.type !== "list" || !Array.isArray(v.values) || !v.names?.length) return false;
  if (v.values.length !== v.names.length) return false;

  const lengths = v.values.map(col => {
    const c = col as RJsValue;
    return Array.isArray(c?.values) ? c.values.length : -1;
  });
  return lengths.length > 0 && lengths.every(n => n >= 0 && n === lengths[0]);
}

/**
 * Shape an R value (as WebR's `.toJs()` gives it) into the envelope.
 *
 * The rule matches the Python and JavaScript probes: something that IS a table
 * renders as a table, everything else as a compact value. In R that means a
 * data.frame becomes rows, a length-1 vector becomes a scalar (R has no
 * separate scalar type, so `mean(x)` arrives as a vector of one), and anything
 * longer becomes an array.
 */
export function rValueToEnvelope(v: RJsValue | null | undefined): REnvelope {
  if (!v) return { kind: "value", value: null };

  if (v.type === "null") return { kind: "value", value: null };

  if (isColumnar(v)) {
    const names = v.names as string[];
    const columns = (v.values as RJsValue[]).map(c => c.values ?? []);
    const height = columns[0]?.length ?? 0;
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < height; i++) {
      const row: Record<string, unknown> = {};
      names.forEach((name, c) => { row[name] = columns[c][i]; });
      rows.push(row);
    }
    return { kind: "table", rows };
  }

  const values = Array.isArray(v.values) ? v.values : [];

  // A named vector is the shape `table()` and `tapply()` return — the closest R
  // has to a Series, and far more readable as two columns than as bare numbers
  // whose labels have been thrown away.
  if (v.names?.length === values.length && values.length > 0 && v.type !== "list") {
    const names = v.names;
    return { kind: "table", rows: values.map((value, i) => ({ name: names[i], value })) };
  }

  if (values.length === 1) return { kind: "value", value: values[0] };
  return { kind: "value", value: values };
}

/**
 * A one-line error message for the drill's error strip.
 *
 * R errors arrive from WebR wrapped and often prefixed with "Error in ..." or
 * carrying a trailing newline. The learner needs the sentence, not the wrapper.
 */
export function formatRError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw
    .trim()
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .find(l => !/^Error: unable to|^In addition:/.test(l));
  if (!line) return "Error";
  // "Error in foo(): message" and "Error: message" both reduce to the message.
  return line.replace(/^Error(\s+in\s+[^:]*)?:\s*/, "").trim() || line;
}

/**
 * The probe DrillMock runs to preview a cell's result. Mirrors emitResultJs —
 * a one-liner, because the shaping happens on the TypeScript side.
 */
export function emitResultR(varName: string): string {
  return `.hugh_emit(${varName})`;
}
