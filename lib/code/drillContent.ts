// ── Notebook-drill content ───────────────────────────────────────────────────
// A tiny pure-Python "dataset" (list of dicts) stands in for a dataframe so the
// drill needs no pandas load and reuses the existing Pyodide worker untouched.
// Cells build on each other (state carries, Jupyter-style); each is checked by
// hidden asserts on a RESULT variable — any correct phrasing passes.
//
// SAMPLE_DRILL below is the fixed fallback. Real drills are produced on demand by
// /api/code/generate-drill from the learning/topic the user picked; both share
// the DrillContent shape so DrillMock renders either identically.

import type { DrillLang } from "@/types/code";

/** A row of the working dataset — flat, JSON-ish, one dict per record. */
export type DataRow = Record<string, string | number>;

/** One logical move in building a cell's one-liner, mapped to its code fragment. */
export interface CellStep {
  do: string;     // the logical move, plain language (imperative)
  code?: string;  // the slice of the solution this step corresponds to
}

export interface DrillCell {
  id: string;
  task: string;        // what to produce, in plain language
  why: string;         // the essence — why this step matters
  solution: string;    // reference — the answer to replicate
  assertions: string;  // hidden asserts on the produced variable
  focus?: string[];    // dataset columns this step touches (highlighted in the table)
  narrative?: string;  // plain-language "how to read this code", outside-in
  steps?: CellStep[];  // the one-liner decomposed into ordered logical moves
}

export interface Scenario {
  title: string;
  role: string;
  goal: string;
  outcome: string;
  setupCode: string;   // read-only setup; Python defines `rows`, SQL builds a table
  // Structured mirror of setupCode's data, so the drill can render a real
  // dataframe table (and highlight columns) instead of raw code. When present,
  // derive setupCode from it via pyRowsLiteral()/sqlSetupFromRows() to keep one
  // source of truth. Absent on generated drills — the UI falls back to text.
  dataset?: DataRow[];
  // SQL only: the table name the dataset is loaded into (e.g. "sales"). Drives
  // the "you're given" copy and lets cells query `FROM <tableName>`.
  tableName?: string;
}

export interface DrillContent {
  scenario: Scenario;
  cells: DrillCell[];
  // Scenario drills build on each other (a cell can use an earlier cell's
  // variable), so each check runs setup + all prior cells. Practice packs are
  // independent bite-size reps — every cell runs against the fresh setup only.
  // Omitted / true = cumulative (back-compat); false = independent.
  cumulative?: boolean;
  // Which runtime executes the cells. Omitted = "python" (Pyodide, back-compat);
  // "sql" runs against DuckDB-wasm and cells assert on a result set, not a var.
  lang?: DrillLang;
  // Python only: how the data is presented. "rows" (default) = a list of dicts
  // named `rows`; "dataframe" = a pandas DataFrame named `df` (loads pandas into
  // the worker). Drives the "you're given" copy and the access hints.
  dataKind?: "rows" | "dataframe";
  // Extra Pyodide packages (by their Pyodide/PyPI name, e.g. "scikit-learn") to
  // preload during boot, outside the per-run timeout — for packs whose cells
  // import something heavier than pandas. Omitted = just ["pandas"] when
  // dataKind is "dataframe", nothing otherwise (back-compat).
  preloadPackages?: string[];
}

/**
 * The speed-meter budget for a cell, derived from how much code it takes — a
 * rough "time to type it" so longer answers get proportionally longer. Clamped
 * to a sane range.
 */
export function timerSecondsFor(cell: DrillCell): number {
  return Math.max(22, Math.min(110, Math.round(16 + cell.solution.length / 1.8)));
}

/**
 * Render a structured dataset as the Python `rows = [...]` literal used for
 * setup. Keeps the table and the executed setup in sync from one source.
 */
export function pyRowsLiteral(rows: DataRow[], varName = "rows"): string {
  const body = rows
    .map(
      r =>
        "    {" +
        Object.entries(r)
          .map(([k, v]) => `${JSON.stringify(k)}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
          .join(", ") +
        "}",
    )
    .join(",\n");
  return `${varName} = [\n${body},\n]`;
}

/**
 * Render a structured dataset as the JavaScript `const rows = [...]` literal used
 * for setup — the JS counterpart to pyRowsLiteral, keeping the rendered table and
 * the executed setup in sync from one source.
 *
 * Keys are emitted BARE where they are valid identifiers, because that is what
 * idiomatic JavaScript looks like and the packs teach reading a field as
 * `r.city`. Quoting every key would model a habit the cells then contradict.
 */
export function jsRowsLiteral(rows: DataRow[], varName = "rows"): string {
  const ident = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  const body = rows
    .map(
      r =>
        "  { " +
        Object.entries(r)
          .map(([k, v]) => `${ident.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(v)}`)
          .join(", ") +
        " }",
    )
    .join(",\n");
  return `const ${varName} = [\n${body},\n];`;
}

/**
 * SQL column type for a value — VARCHAR for strings, INTEGER for whole numbers,
 * DOUBLE otherwise. Enough for the small, clean datasets the packs use.
 */
function sqlType(v: string | number): string {
  if (typeof v === "string") return "VARCHAR";
  return Number.isInteger(v) ? "INTEGER" : "DOUBLE";
}

/** A SQL literal for a value — quoted+escaped string, or a bare number. */
function sqlLiteral(v: string | number): string {
  return typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v);
}

/**
 * Build the DuckDB setup DDL (CREATE TABLE + INSERT) for a SQL drill from the
 * same structured dataset the table renders — one source of truth, mirroring
 * pyRowsLiteral() for Python. Uses CREATE OR REPLACE so re-running setup before
 * every cell is idempotent. Column types are inferred from the first row.
 */
export function sqlSetupFromRows(rows: DataRow[], tableName: string): string {
  if (rows.length === 0) return `CREATE OR REPLACE TABLE ${tableName} (id INTEGER);`;
  const cols = Object.keys(rows[0]);
  const colDefs = cols.map(c => `${c} ${sqlType(rows[0][c])}`).join(", ");
  const values = rows
    .map(r => "  (" + cols.map(c => sqlLiteral(r[c])).join(", ") + ")")
    .join(",\n");
  return `CREATE OR REPLACE TABLE ${tableName} (${colDefs});\nINSERT INTO ${tableName} VALUES\n${values};`;
}

/**
 * Build the pandas setup for a DataFrame drill from the same structured dataset
 * the table renders — the pandas counterpart to pyRowsLiteral(). Emits the
 * import + a `df = pd.DataFrame([...])` from the row dicts, one source of truth.
 */
export function pdDataFrameLiteral(rows: DataRow[], varName = "df"): string {
  return `import pandas as pd\n${varName} = pd.DataFrame(${jsonRowsLiteral(rows)})`;
}

/** The row list as a Python list-of-dicts literal (JSON is valid Python here). */
function jsonRowsLiteral(rows: DataRow[]): string {
  const body = rows
    .map(
      r =>
        "    {" +
        Object.entries(r)
          .map(([k, v]) => `${JSON.stringify(k)}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
          .join(", ") +
        "}",
    )
    .join(",\n");
  return `[\n${body},\n]`;
}

/**
 * The variable a cell produces — the name the "key" panel prints (and the same
 * one the hidden asserts check). A cell may set up a helper first (e.g. `s = …`)
 * before the line that actually produces its answer, so we take the LAST
 * top-level (column-0) bare-name assignment, not the first. Indented lines,
 * augmented (`+=`), subscript (`a[i] =`), tuple (`a, b =`), and comparison
 * (`==`) assignments are skipped, so accumulator loops resolve to the name
 * declared before the loop.
 */
export function resultVarOf(cell: DrillCell): string | null {
  // The optional const/let/var lets this read a JavaScript solution too;
  // Python has no such keywords, so the same pattern serves both languages.
  const matches = [...cell.solution.matchAll(/^(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=(?!=)/gm)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

/** Column names of a dataset, in first-row order. */
export function columnsOf(dataset: DataRow[]): string[] {
  return dataset.length ? Object.keys(dataset[0]) : [];
}

export const SAMPLE_DRILL: DrillContent = {
  scenario: {
    title: "Which region should we back next quarter?",
    role: "You're the analyst; the sales lead wants a quick, defensible read before planning.",
    goal:
      "Turn a raw pile of orders into a recommendation. The through-line: which region is biggest by volume, and what's our total revenue? Each cell drills one core move — filter a slice, total a column, group by a key, then pick the leader — building from raw data to the answer.",
    outcome:
      "There's your answer, end-to-end: total revenue is $206, and EU is the biggest region at 9 units — the one to back.",
    setupCode: `rows = [
    {"region": "EU",   "product": "A", "units": 3, "price": 10},
    {"region": "NA",   "product": "B", "units": 5, "price": 8},
    {"region": "EU",   "product": "B", "units": 2, "price": 8},
    {"region": "APAC", "product": "A", "units": 7, "price": 10},
    {"region": "NA",   "product": "A", "units": 1, "price": 10},
    {"region": "EU",   "product": "A", "units": 4, "price": 10},
]`,
  },
  cells: [
    {
      id: "eu",
      task: `Create eu — a list of only the rows where region is "EU".`,
      why: "Almost every analysis starts by narrowing to the slice you care about. Isolate the EU rows now so every later step runs on the right subset instead of the whole table.",
      solution: `eu = [r for r in rows if r["region"] == "EU"]`,
      assertions:
        `assert isinstance(eu, list) and len(eu) == 3 and all(r["region"] == "EU" for r in eu)`,
    },
    {
      id: "revenue",
      task: "Create revenue — the total of units × price across all rows.",
      why: "One headline number is what stakeholders actually ask for. Multiplying per row, then summing, is the pattern behind almost every KPI you'll ever compute.",
      solution: `revenue = sum(r["units"] * r["price"] for r in rows)`,
      assertions: `assert revenue == 206`,
    },
    {
      id: "by_region",
      task: "Create by_region — a dict mapping each region to its total units.",
      why: "A single total hides the differences between groups. Aggregating by a key (here, region) is how you turn raw rows into a comparison — the heart of most reporting.",
      solution: `by_region = {}
for r in rows:
    by_region[r["region"]] = by_region.get(r["region"], 0) + r["units"]`,
      assertions: `assert by_region == {"EU": 9, "NA": 6, "APAC": 7}`,
    },
    {
      id: "top",
      task: "Create top — the region with the most total units (use by_region).",
      why: "Once you have a grouped summary, the decision usually comes down to picking the max (or min). Reusing by_region shows how each step builds on the one before it.",
      solution: `top = max(by_region, key=by_region.get)`,
      assertions: `assert top == "EU"`,
    },
  ],
};
