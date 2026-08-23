// Pyodide runner worker.
//
// Runs entirely off the main thread so that runaway learner code (e.g.
// `while True:`) can never freeze the UI — the client simply terminates and
// respawns this worker. Pyodide is pulled from the jsDelivr CDN, so nothing is
// bundled and no API key or server is involved.
//
// Typed against `globalThis` rather than the DOM-conflicting webworker lib to
// avoid duplicate-global errors with the project's `dom` lib setting.

const PYODIDE_VERSION = "0.26.4";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

interface PyProxyLike {
  destroy?: () => void;
}

interface PyodideLike {
  runPythonAsync(code: string, options?: { globals?: unknown }): Promise<unknown>;
  loadPackagesFromImports(code: string): Promise<unknown>;
  loadPackage(names: string[]): Promise<unknown>;
  toPy(obj: unknown): PyProxyLike;
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
  globals: { set(name: string, value: unknown): void };
}

const ctx = globalThis as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (data: unknown) => void;
  importScripts: (...urls: string[]) => void;
  loadPyodide: (config: { indexURL: string }) => Promise<PyodideLike>;
};

let pyodide: PyodideLike | null = null;

const ready: Promise<void> = (async () => {
  ctx.importScripts(`${CDN}pyodide.js`);
  pyodide = await ctx.loadPyodide({ indexURL: CDN });
})();

ready.then(
  () => ctx.postMessage({ type: "ready" }),
  (err) => ctx.postMessage({ type: "init-error", error: String(err) }),
);

/**
 * ── NOTEBOOK SESSION MODE ───────────────────────────────────────────────────
 * The drill path above rebuilds a fresh namespace per run so variables never
 * leak between rungs. A notebook needs exactly the opposite: ONE namespace that
 * every cell shares, because cell 4 reads what cell 3 defined. This preamble
 * installs that namespace plus two helpers, and is loaded once per session.
 *
 * `__hugh_render` runs a cell the way Jupyter does — exec the body, then eval a
 * trailing expression so `df.head()` displays without `print()`. stdout is
 * captured inside Python rather than through `setStdout`, so session mode and
 * drill mode can't tread on each other's output handler.
 */
const SESSION_PREAMBLE = `
import ast, io, json, contextlib
import pandas as pd
import numpy as np

pd.set_option("display.max_rows", 40)
pd.set_option("display.max_columns", 40)
pd.set_option("display.width", 140)

# The one namespace every cell shares.
__hugh_ns = {"pd": pd, "np": np}

def __hugh_render(src):
    buf = io.StringIO()
    value = None
    tree = ast.parse(src)
    tail = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        tail = ast.Expression(tree.body.pop().value)
    with contextlib.redirect_stdout(buf):
        exec(compile(tree, "<cell>", "exec"), __hugh_ns)
        if tail is not None:
            value = eval(compile(tail, "<cell>", "eval"), __hugh_ns)
    html = None
    text = None
    if isinstance(value, pd.DataFrame):
        html = value.to_html(border=0, classes="hugh-df", max_rows=40)
    elif isinstance(value, pd.Series):
        html = value.to_frame().to_html(border=0, classes="hugh-df", max_rows=40)
    elif isinstance(value, np.generic):
        # numpy 2 reprs scalars as "np.float64(-1.38)" — show the number.
        text = repr(value.item())
    elif value is not None:
        text = repr(value)
    return json.dumps({"stdout": buf.getvalue(), "html": html, "text": text})

def __hugh_bind(csv_text):
    """Bind the case CSV as the name df, so the learner never has to load it."""
    __hugh_ns["df"] = pd.read_csv(io.StringIO(csv_text))
    frame = __hugh_ns["df"]
    return json.dumps({
        "rows": int(len(frame)),
        "columns": [str(c) for c in frame.columns],
    })
`;

interface SessionInitRequest {
  type: "session-init";
  id: number;
  /** The case's CSV, fetched on the main thread and bound here as `df`. */
  csv: string;
}

interface CellRequest {
  type: "cell";
  id: number;
  code: string;
}

interface RunRequest {
  type: "run";
  id: number;
  code: string;
  assertions: string;
}

interface PreloadRequest {
  type: "preload";
  id: number;
  packages: string[];
}

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data as RunRequest | PreloadRequest | SessionInitRequest | CellRequest;

  // Preload heavy packages (e.g. pandas) up front, outside the run timeout, so
  // the first cell run isn't killed mid-download.
  if (msg?.type === "preload") {
    await ready;
    let error: string | null = null;
    try {
      if (pyodide) await pyodide.loadPackage(msg.packages);
    } catch (err) {
      error = formatPyError(err);
    }
    ctx.postMessage({ type: "preloaded", id: msg.id, error });
    return;
  }

  // Boot a notebook session: pandas/numpy, the shared namespace, and `df`
  // bound from the case CSV — all outside any per-cell timeout.
  if (msg?.type === "session-init") {
    await ready;
    let error: string | null = null;
    let summary: string | null = null;
    try {
      if (pyodide) {
        await pyodide.loadPackage(["pandas", "numpy"]);
        await pyodide.runPythonAsync(SESSION_PREAMBLE);
        pyodide.globals.set("__hugh_csv", msg.csv);
        summary = String(await pyodide.runPythonAsync("__hugh_bind(__hugh_csv)"));
      }
    } catch (err) {
      error = formatPyError(err);
    }
    ctx.postMessage({ type: "session-ready", id: msg.id, error, summary });
    return;
  }

  // Run one notebook cell in the shared namespace.
  if (msg?.type === "cell") {
    await ready;
    let payload: string | null = null;
    let error: string | null = null;
    try {
      if (pyodide) {
        pyodide.globals.set("__hugh_src", msg.code);
        payload = String(await pyodide.runPythonAsync("__hugh_render(__hugh_src)"));
      }
    } catch (err) {
      error = formatPyError(err);
    }
    ctx.postMessage({ type: "cell-result", id: msg.id, payload, error });
    return;
  }

  if (!msg || msg.type !== "run") return;

  await ready;
  if (!pyodide) return;

  let stdout = "";
  pyodide.setStdout({ batched: (s) => { stdout += s + "\n"; } });
  pyodide.setStderr({ batched: () => {} });

  // Fresh namespace per attempt so variables never leak between rungs.
  const namespace = pyodide.toPy({});

  let passed = false;
  let error: string | null = null;
  try {
    // Auto-install any packages the code imports (e.g. pandas/numpy for the
    // DataFrame packs) — a no-op once loaded, and free for stdlib/SQL drills.
    await pyodide.loadPackagesFromImports(msg.code);
    await pyodide.runPythonAsync(msg.code, { globals: namespace });
    try {
      // Assertions share the learner's namespace, so they can read the
      // variables/functions the learner defined.
      await pyodide.runPythonAsync(msg.assertions, { globals: namespace });
      passed = true;
    } catch (assertErr) {
      error = formatPyError(assertErr);
    }
  } catch (runErr) {
    error = formatPyError(runErr);
  } finally {
    namespace.destroy?.();
  }

  ctx.postMessage({
    type: "result",
    id: msg.id,
    passed,
    stdout: stdout.trimEnd(),
    error,
  });
};

/** Pyodide errors carry a full traceback; surface the last meaningful line. */
function formatPyError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const lines = text.trim().split("\n").filter(Boolean);
  return lines[lines.length - 1] ?? "Error";
}
