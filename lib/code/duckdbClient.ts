import type { DrillRunner, RunResult } from "@/types/code";

/**
 * DuckDB-wasm runtime for SQL drills — the SQL counterpart to PyodideRunner.
 *
 * DuckDB ships its own worker bundle (pulled from jsDelivr, like Pyodide), so
 * queries run off the main thread and the page stays responsive. A cell is a
 * SELECT: `run` executes the setup DDL + the learner's query, materialises the
 * final result set, and validates it against the cell's expected rows (`check`,
 * a JSON array). The result is returned in the shared `{kind,…}` envelope so the
 * existing ResultTable / KeyPanel render it unchanged.
 *
 * Browser-only — never import from a server component or API route.
 */

// duckdb-wasm is a heavy, browser-only module; import lazily inside init() so it
// never lands in a server bundle and only downloads when a SQL drill is opened.
type DuckConn = { query(sql: string): Promise<ArrowTableLike>; close(): Promise<void> };
type DuckDB = { connect(): Promise<DuckConn>; terminate(): Promise<void> };
interface ArrowField { name: string }
interface ArrowTableLike {
  schema: { fields: ArrowField[] };
  toArray(): Array<Record<string, unknown>>;
}

/** Max wall-clock for a single query before we assume something is wrong. */
const EXEC_TIMEOUT_MS = 8000;

export class DuckDBRunner implements DrillRunner {
  private conn: DuckConn | null = null;
  private db: DuckDB | null = null;
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;

  init(): Promise<void> {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("DuckDBRunner is browser-only"));
    }
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.boot();
    return this.readyPromise;
  }

  private async boot(): Promise<void> {
    const duckdb = await import("@duckdb/duckdb-wasm");
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    // The worker script lives cross-origin on the CDN; browsers block that for
    // `new Worker`, so wrap it in a same-origin blob that importScripts it.
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }),
    );
    this.worker = new Worker(workerUrl);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), this.worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    this.db = db as unknown as DuckDB;
    this.conn = await this.db.connect();
  }

  async run(code: string, check: string): Promise<RunResult> {
    try {
      await this.init();
    } catch (e) {
      return { passed: false, stdout: "", error: `Couldn't start SQL: ${errText(e)}` };
    }
    const exec = this.execute(code, check);
    const timeout = new Promise<RunResult>((resolve) =>
      setTimeout(() => resolve({ passed: false, stdout: "", error: "Query timed out." }), EXEC_TIMEOUT_MS),
    );
    return Promise.race([exec, timeout]);
  }

  private async execute(code: string, check: string): Promise<RunResult> {
    if (!this.conn) return { passed: false, stdout: "", error: "SQL engine not ready." };
    let rows: Record<string, unknown>[];
    try {
      rows = await this.runStatements(code);
    } catch (e) {
      return { passed: false, stdout: "", error: errText(e) };
    }

    const stdout = envelope(rows);
    const expected = check.trim();
    if (!expected) return { passed: true, stdout, error: null }; // precompute path — just the result

    let want: Record<string, unknown>[];
    try {
      want = JSON.parse(expected) as Record<string, unknown>[];
    } catch {
      return { passed: false, stdout, error: "Malformed expected result." };
    }
    const diff = compareRows(rows, want);
    return diff ? { passed: false, stdout, error: diff } : { passed: true, stdout, error: null };
  }

  /** Runs each `;`-separated statement; returns the last one's result rows. */
  private async runStatements(code: string): Promise<Record<string, unknown>[]> {
    const statements = code.split(";").map(s => s.trim()).filter(Boolean);
    let last: ArrowTableLike | null = null;
    for (const stmt of statements) last = await this.conn!.query(stmt);
    if (!last) return [];
    const fields = last.schema.fields.map(f => f.name);
    // Access columns by name off each row proxy (avoids relying on a specific
    // arrow toJSON()); normalize coerces BigInt / HUGEINT wrappers to primitives.
    return last.toArray().map((row) => {
      const out: Record<string, unknown> = {};
      for (const f of fields) out[f] = normalize(row[f]);
      return out;
    });
  }

  destroy(): void {
    void this.conn?.close().catch(() => {});
    void this.db?.terminate().catch(() => {});
    this.worker?.terminate();
    this.conn = null;
    this.db = null;
    this.worker = null;
    this.readyPromise = null;
  }
}

/**
 * Flatten a DuckDB/Arrow value to a JS primitive for comparison + JSON. Integers
 * come back as BigInt; wider types (HUGEINT, DECIMAL) may arrive as wrapper
 * objects, so coerce via valueOf()/Number() and fall back to a string.
 */
function normalize(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  try {
    const p = (v as { valueOf?: () => unknown }).valueOf?.();
    if (typeof p === "bigint") return Number(p);
    if (typeof p === "number") return p;
  } catch {
    /* fall through to Number()/String() */
  }
  const n = Number(v as number);
  return Number.isFinite(n) ? n : String(v);
}

/** The shared result envelope DrillMock's parseResult understands. */
function envelope(rows: Record<string, unknown>[]): string {
  // A single scalar cell shows as a value chip (parity with Python); otherwise a table.
  if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
    return JSON.stringify({ kind: "value", value: Object.values(rows[0])[0] });
  }
  return JSON.stringify({ kind: "table", rows });
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** First mismatch between the query result and the expected rows, or null if equal. */
function compareRows(
  actual: Record<string, unknown>[],
  expected: Record<string, unknown>[],
): string | null {
  if (actual.length !== expected.length) {
    return `Expected ${expected.length} row${expected.length === 1 ? "" : "s"}, got ${actual.length}.`;
  }
  for (let i = 0; i < expected.length; i++) {
    for (const key of Object.keys(expected[i])) {
      const a = actual[i]?.[key];
      const e = expected[i][key];
      const same =
        typeof a === "number" && typeof e === "number" ? round6(a) === round6(e) : a === e;
      if (!same) {
        return `Row ${i + 1}, column "${key}": expected ${fmt(e)}, got ${fmt(a)}.`;
      }
    }
  }
  return null;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  return typeof v === "string" ? `"${v}"` : String(v);
}

function errText(e: unknown): string {
  const t = e instanceof Error ? e.message : String(e);
  return t.trim().split("\n").filter(Boolean).pop() ?? "Error";
}
