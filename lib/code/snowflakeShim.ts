// ── The Snowflake compatibility shim ─────────────────────────────────────────
//
// Snowflake drills run on the same DuckDB-wasm engine as the other SQL packs
// (there is no Snowflake in the browser), so the learner types real Snowflake
// and DuckDB has to answer. Most of it already does — QUALIFY, `::` casts,
// TRY_CAST, DATEDIFF, DATE_TRUNC, LAST_DAY, ARRAY_AGG, SPLIT_PART, MERGE,
// PIVOT, GROUP BY ALL, SELECT * EXCLUDE, ILIKE, MEDIAN and IGNORE NULLS
// windows all parse unchanged. What DuckDB lacks is a set of Snowflake-named
// scalar functions, and those are restored below as macros.
//
// This is a SHIM, not an emulator, and the distinction matters:
//   - It only ever ADDS Snowflake spellings. It never rewrites the learner's
//     query, so a passing cell is a query whose real Snowflake syntax ran and
//     produced the right rows — not one a translator guessed at.
//   - Anything the shim cannot express honestly is simply not drilled. Snowflake
//     features that fail at the PARSER or architecture level are out of reach of
//     any macro and deliberately absent from these packs: `:` VARIANT paths,
//     LATERAL FLATTEN, TABLE(GENERATOR(…)), time travel AT(OFFSET => …),
//     streams, tasks, stages / COPY INTO, warehouses, CLUSTER BY, RBAC/GRANT,
//     LISTAGG … WITHIN GROUP, RATIO_TO_REPORT, RLIKE and SAMPLE (n ROWS).
//     A drill that quietly accepted a near-miss for those would teach the wrong
//     syntax with full confidence, which is worse than not covering them.
//
// Known, deliberate narrowings — the macros cover the shapes the packs drill,
// not the full Snowflake signature:
//   - DATEADD takes a QUOTED unit ('day'), Snowflake's bare `day` cannot parse
//     here, and the result is cast back to DATE (the packs only add date parts).
//   - TO_VARCHAR handles the date-part format tokens YYYY / MM / DD only.
//   - DECODE is the four-argument (one search, one default) form.
//   - ARRAY_CONSTRUCT / OBJECT_CONSTRUCT are overloaded by arity rather than
//     variadic, because DuckDB macros are not.
//
// One divergence no macro can paper over, found by running the packs: casting an
// exact half to an integer rounds DOWN here (DuckDB rounds half to even) and UP
// in Snowflake (half away from zero) — 120.5::INTEGER is 120 here, 121 there.
// Never author a cell whose expected value sits on a .5 boundary; the drill
// would mark the correct Snowflake answer wrong.
//
// AUTHORING RULE for cells built on this: every output column must be a string,
// number or boolean. DATE, TIMESTAMP, LIST and JSON values cross the Arrow
// boundary as wrapper objects that the runner's normalize() flattens
// unpredictably, so cast them — `::VARCHAR`, TO_VARCHAR(), ARRAY_TO_STRING() —
// which is idiomatic Snowflake anyway.

import { sqlSetupFromRows, type DataRow } from "./drillContent";

/**
 * The macro prelude. Prepended to every Snowflake pack's setup, so it is
 * re-declared before each cell runs — CREATE OR REPLACE keeps that idempotent.
 * Statement-per-line: the runner splits setup on `;`, so no macro body may
 * contain one.
 */
export const SNOWFLAKE_MACROS: string = [
  `CREATE OR REPLACE MACRO iff(c, a, b) AS CASE WHEN c THEN a ELSE b END;`,
  `CREATE OR REPLACE MACRO nvl(a, b) AS coalesce(a, b);`,
  `CREATE OR REPLACE MACRO nvl2(e, a, b) AS CASE WHEN e IS NOT NULL THEN a ELSE b END;`,
  `CREATE OR REPLACE MACRO zeroifnull(a) AS coalesce(a, 0);`,
  `CREATE OR REPLACE MACRO nullifzero(a) AS nullif(a, 0);`,
  `CREATE OR REPLACE MACRO div0(a, b) AS CASE WHEN b = 0 THEN 0 ELSE a / b END;`,
  `CREATE OR REPLACE MACRO decode(e, s, r, d) AS CASE WHEN e = s THEN r ELSE d END;`,
  `CREATE OR REPLACE MACRO to_number(s) AS CAST(s AS DECIMAL(18,2));`,
  `CREATE OR REPLACE MACRO try_to_number(s) AS try_cast(s AS DOUBLE);`,
  `CREATE OR REPLACE MACRO dateadd(unit, n, d) AS CAST(d + (n::VARCHAR || ' ' || unit)::INTERVAL AS DATE);`,
  `CREATE OR REPLACE MACRO to_varchar(d, f) AS strftime(d, replace(replace(replace(f, 'YYYY', '%Y'), 'MM', '%m'), 'DD', '%d'));`,
  `CREATE OR REPLACE MACRO to_date(s) AS CAST(s AS DATE);`,
  `CREATE OR REPLACE MACRO parse_json(s) AS s::JSON;`,
  `CREATE OR REPLACE MACRO get_path(j, p) AS json_extract_string(j, '$.' || p);`,
  `CREATE OR REPLACE MACRO json_extract_path_text(s, p) AS json_extract_string(s, '$.' || p);`,
  `CREATE OR REPLACE MACRO array_contains(v, a) AS list_contains(a, v);`,
  `CREATE OR REPLACE MACRO array_size(a) AS len(a);`,
  `CREATE OR REPLACE MACRO array_construct(a, b) AS [a, b], (a, b, c) AS [a, b, c], (a, b, c, d) AS [a, b, c, d];`,
  `CREATE OR REPLACE MACRO object_construct(k1, v1) AS json_object(k1::VARCHAR, v1), (k1, v1, k2, v2) AS json_object(k1::VARCHAR, v1, k2::VARCHAR, v2);`,
  `CREATE OR REPLACE MACRO regexp_substr(s, p) AS regexp_extract(s, p);`,
  `CREATE OR REPLACE MACRO charindex(sub, s) AS position(sub IN s);`,
  `CREATE OR REPLACE MACRO startswith(s, p) AS starts_with(s, p);`,
  `CREATE OR REPLACE MACRO editdistance(a, b) AS levenshtein(a, b);`,
].join("\n");

/**
 * Setup for a Snowflake pack: the macro prelude, then the pack's table built
 * from the same structured rows the drill renders. Mirrors sqlSetupFromRows so
 * the table and the executed setup keep one source of truth.
 */
export function snowflakeSetup(rows: DataRow[], tableName: string): string {
  return `${SNOWFLAKE_MACROS}\n${sqlSetupFromRows(rows, tableName)}`;
}

/** The Snowflake function names the shim restores — used by its unit test. */
export const SHIMMED_FUNCTIONS: string[] = [
  "iff", "nvl", "nvl2", "zeroifnull", "nullifzero", "div0", "decode",
  "to_number", "try_to_number", "dateadd", "to_date", "to_varchar", "parse_json",
  "get_path", "json_extract_path_text", "array_contains",
  "array_size", "array_construct", "object_construct", "regexp_substr",
  "charindex", "startswith", "editdistance",
];
