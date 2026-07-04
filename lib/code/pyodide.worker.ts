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
  toPy(obj: unknown): PyProxyLike;
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
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

interface RunRequest {
  type: "run";
  id: number;
  code: string;
  assertions: string;
}

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data as RunRequest;
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
