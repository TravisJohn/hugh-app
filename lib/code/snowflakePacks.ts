// ── Snowflake SQL packs — dialect fluency, not a second SQL course ────────────
//
// The sqlPacks.ts family teaches SQL *as analysis* (clean, profile, chart,
// regress, forecast). These packs teach the SNOWFLAKE DIALECT: the spellings a
// Snowflake console expects, drilled until they come out of the fingers —
// QUALIFY instead of a subquery, IFF instead of CASE, `::` casts, DATEADD /
// DATEDIFF, semi-structured access, MERGE, PIVOT.
//
// They run on DuckDB-wasm like every other SQL pack, with the Snowflake-named
// functions restored by the macro prelude in snowflakeShim.ts. Read that file
// before adding a cell: it lists what the shim covers, what it deliberately
// narrows, and the Snowflake features that cannot execute here at all and are
// therefore not drilled. Every cell below is REAL Snowflake — nothing is
// rewritten on the way in, so a green cell is syntax the learner can type into
// a Snowflake worksheet unchanged.
//
// Output rule (from the shim's authoring note): every result column is a
// string, number or boolean. Dates, arrays and JSON get cast on the way out via
// `::VARCHAR`, TO_VARCHAR() or ARRAY_TO_STRING() — idiomatic Snowflake, and it
// keeps the Arrow round-trip lossless.
//
// Every query and every expected result in this file was executed against a
// real DuckDB with the real shim before shipping.

import type { DataRow, DrillContent } from "./drillContent";
import { snowflakeSetup } from "./snowflakeShim";
import type { DrillPack } from "./packs";

/** Expected result set → the JSON string stored in a cell's `assertions`. */
const expect = (rows: Array<Record<string, string | number | boolean | null>>): string =>
  JSON.stringify(rows);

// ── Pack 1: Snowflake essentials (table orders) ──────────────────────────────
const ORDER_ROWS: DataRow[] = [
  { id: 1, customer: " Ann ", region: "EMEA", amount: 120.4,  qty: "2",   status: "Shipped" },
  { id: 2, customer: "Ben",   region: "emea", amount: 0,      qty: "n/a", status: "shipped" },
  { id: 3, customer: "Cara",  region: "AMER", amount: 340.25, qty: "5",   status: "Pending" },
  { id: 4, customer: "Dan",   region: "APAC", amount: 75,     qty: "1",   status: "CANCELLED" },
  { id: 5, customer: " Eve",  region: "amer", amount: 210,    qty: "n/a", status: "Shipped" },
  { id: 6, customer: "Finn",  region: "APAC", amount: 90.75,  qty: "3",   status: "pending" },
];

const SF_ESSENTIALS: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Snowflake essentials — the everyday functions",
    role: "You're in a Snowflake worksheet against an `orders` table. Some amounts are zero, some quantities are the text 'n/a', and the region and status casing is a mess.",
    goal: "Each cell is one SELECT written in Snowflake's own spellings — IFF, NVL, ZEROIFNULL, NULLIFZERO, DIV0, DECODE, TRY_TO_NUMBER, `::`, ILIKE, LISTAGG, GROUP BY ALL. Independent reps; write each from memory.",
    outcome: "That's the Snowflake shortlist. The ANSI forms still work, but these are what Snowflake code actually looks like — and what an exam question will put in front of you.",
    setupCode: snowflakeSetup(ORDER_ROWS, "orders"),
    dataset: ORDER_ROWS,
    tableName: "orders",
  },
  cells: [
    { id: "iff", task: "Select each order's size — 'large' when amount is 100 or more, else 'small' — as size (ordered by id).", why: "IFF is Snowflake's two-branch CASE. Shorter to type, and everywhere in Snowflake code.",
      focus: ["amount"], solution: `SELECT IFF(amount >= 100, 'large', 'small') AS size FROM orders ORDER BY id`,
      assertions: expect(["large","small","large","small","large","small"].map(size => ({ size }))),
      narrative: `IFF(condition, then, else) is one function call where ANSI SQL needs CASE WHEN … THEN … ELSE … END. Same result, a third of the typing.`,
      steps: [
        { do: "Test the amount", code: `amount >= 100` },
        { do: "Pick a label either way", code: `IFF(…, 'large', 'small')` },
      ] },
    { id: "nullifzero", task: "Select each amount with zero turned into NULL, as amount (ordered by id).", why: "NULLIFZERO says \"this zero means missing\" — the setup for every safe average or division.",
      focus: ["amount"], solution: `SELECT NULLIFZERO(amount) AS amount FROM orders ORDER BY id`,
      assertions: expect([{ amount: 120.4 }, { amount: null }, { amount: 340.25 }, { amount: 75 }, { amount: 210 }, { amount: 90.75 }]),
      narrative: `NULLIFZERO(amount) returns NULL when the value is 0 and the value otherwise, so a placeholder zero stops being counted as a real number.`,
      steps: [{ do: "Turn zero into NULL", code: `NULLIFZERO(amount)` }] },
    { id: "nvl", task: "Select each amount with zero replaced by -1, as amount (ordered by id).", why: "NVL is Snowflake's two-argument COALESCE — the standard NULL fallback.",
      focus: ["amount"], solution: `SELECT NVL(NULLIFZERO(amount), -1) AS amount FROM orders ORDER BY id`,
      assertions: expect([{ amount: 120.4 }, { amount: -1 }, { amount: 340.25 }, { amount: 75 }, { amount: 210 }, { amount: 90.75 }]),
      narrative: `NULLIFZERO turns the 0 into a NULL, and NVL(…, -1) immediately catches that NULL and substitutes the sentinel — a two-step clean in one expression.`,
      steps: [
        { do: "Zero becomes NULL", code: `NULLIFZERO(amount)` },
        { do: "NULL becomes -1", code: `NVL(…, -1)` },
      ] },
    { id: "try", task: "Select each qty converted to a number, as qty — non-numeric text becomes NULL (ordered by id).", why: "TRY_TO_NUMBER converts what it can and returns NULL for the rest, instead of failing the whole query.",
      focus: ["qty"], solution: `SELECT TRY_TO_NUMBER(qty) AS qty FROM orders ORDER BY id`,
      assertions: expect([{ qty: 2 }, { qty: null }, { qty: 5 }, { qty: 1 }, { qty: null }, { qty: 3 }]),
      narrative: `A plain cast on 'n/a' would abort the whole query. The TRY_ family converts row by row and yields NULL where the value can't be parsed, so the good rows still come back.`,
      steps: [{ do: "Convert, tolerating junk", code: `TRY_TO_NUMBER(qty)` }] },
    { id: "zeroifnull", task: "Select each qty as a number with the non-numeric ones as 0, as qty (ordered by id).", why: "ZEROIFNULL is the numeric partner to NVL — missing becomes zero in one call.",
      focus: ["qty"], solution: `SELECT ZEROIFNULL(TRY_TO_NUMBER(qty)) AS qty FROM orders ORDER BY id`,
      assertions: expect([{ qty: 2 }, { qty: 0 }, { qty: 5 }, { qty: 1 }, { qty: 0 }, { qty: 3 }]),
      narrative: `TRY_TO_NUMBER leaves NULLs where the text wasn't numeric; ZEROIFNULL folds those NULLs to 0 so the column is safe to sum.`,
      steps: [
        { do: "Parse what you can", code: `TRY_TO_NUMBER(qty)` },
        { do: "NULL becomes zero", code: `ZEROIFNULL(…)` },
      ] },
    { id: "div0", task: "Select the price per unit — amount divided by qty, to 2dp — as unit_price (ordered by id).", why: "DIV0 returns 0 instead of erroring when the divisor is zero.",
      focus: ["amount", "qty"], solution: `SELECT round(DIV0(amount, ZEROIFNULL(TRY_TO_NUMBER(qty))), 2) AS unit_price FROM orders ORDER BY id`,
      assertions: expect([{ unit_price: 60.2 }, { unit_price: 0 }, { unit_price: 68.05 }, { unit_price: 75 }, { unit_price: 0 }, { unit_price: 30.25 }]),
      narrative: `The 'n/a' quantities became 0, which would normally be a divide-by-zero. DIV0(a, b) short-circuits that to 0, so one bad row doesn't take out the query.`,
      steps: [
        { do: "Divide safely", code: `DIV0(amount, …)` },
        { do: "Round the money", code: `round(…, 2)` },
      ] },
    { id: "cast", task: "Select each amount as a whole number, as amount, using Snowflake's cast shorthand (ordered by id).", why: "`::` is the cast you'll type a hundred times a day in Snowflake.",
      focus: ["amount"], solution: `SELECT amount::INTEGER AS amount FROM orders ORDER BY id`,
      assertions: expect([{ amount: 120 }, { amount: 0 }, { amount: 340 }, { amount: 75 }, { amount: 210 }, { amount: 91 }]),
      narrative: `value::TYPE is shorthand for CAST(value AS TYPE). Casting a decimal to INTEGER rounds it rather than truncating — 90.75 comes back as 91, not 90.`,
      steps: [{ do: "Cast with the shorthand", code: `amount::INTEGER` }] },
    { id: "decode", task: "Select each order's market — 'Europe' when the region is EMEA in any casing, else 'Rest of world' — as market (ordered by id).", why: "DECODE is a compact equality lookup: value, match, result, default.",
      focus: ["region"], solution: `SELECT DECODE(upper(region), 'EMEA', 'Europe', 'Rest of world') AS market FROM orders ORDER BY id`,
      assertions: expect(["Europe","Europe","Rest of world","Rest of world","Rest of world","Rest of world"].map(market => ({ market }))),
      narrative: `upper(region) flattens the mixed casing first; DECODE then compares it to 'EMEA' and returns either that match's result or the trailing default.`,
      steps: [
        { do: "Normalise the casing", code: `upper(region)` },
        { do: "Match, result, default", code: `DECODE(…, 'EMEA', 'Europe', 'Rest of world')` },
      ] },
    { id: "ilike", task: "Count the orders whose status is 'shipped' whatever the casing, as n.", why: "ILIKE is a case-insensitive match — no LOWER() wrapper needed.",
      focus: ["status"], solution: `SELECT count(*) AS n FROM orders WHERE status ILIKE 'shipped'`,
      assertions: expect([{ n: 3 }]),
      narrative: `ILIKE is LIKE with case sensitivity switched off, so 'Shipped' and 'shipped' both match the one pattern and count(*) tallies them.`,
      steps: [
        { do: "Match ignoring case", code: `WHERE status ILIKE 'shipped'` },
        { do: "Tally the matches", code: `count(*) AS n` },
      ] },
    { id: "listagg", task: "Select the APAC customers' trimmed names joined by ', ' into one string, as customers.", why: "LISTAGG collapses a column into a single delimited string — the SQL way to make a list.",
      focus: ["customer", "region"], solution: `SELECT LISTAGG(trim(customer), ', ') AS customers FROM orders WHERE upper(region) = 'APAC'`,
      assertions: expect([{ customers: "Dan, Finn" }]),
      narrative: `The WHERE narrows to APAC, trim() cleans each name, and LISTAGG glues the surviving values together with the separator you pass it.`,
      steps: [
        { do: "Keep only APAC", code: `WHERE upper(region) = 'APAC'` },
        { do: "Join the names", code: `LISTAGG(trim(customer), ', ')` },
      ] },
    { id: "groupall", task: "Select each uppercased region and its total amount, as region and total, using GROUP BY ALL (ordered by region).", why: "GROUP BY ALL groups by every non-aggregate column, so the clause can't drift from the SELECT.",
      focus: ["region", "amount"], solution: `SELECT upper(region) AS region, sum(amount) AS total FROM orders GROUP BY ALL ORDER BY region`,
      assertions: expect([{ region: "AMER", total: 550.25 }, { region: "APAC", total: 165.75 }, { region: "EMEA", total: 120.4 }]),
      narrative: `GROUP BY ALL tells Snowflake to group by whatever isn't aggregated — here upper(region) — so editing the SELECT list can't leave a stale GROUP BY behind.`,
      steps: [
        { do: "Aggregate the amounts", code: `sum(amount) AS total` },
        { do: "Group by everything else", code: `GROUP BY ALL` },
      ] },
  ],
};

// ── Pack 2: QUALIFY & window functions (table sales) ─────────────────────────
const SALES_ROWS: DataRow[] = [
  { id: 1, rep: "Ann",  region: "EMEA", month: "Jan", amount: 120 },
  { id: 2, rep: "Ann",  region: "EMEA", month: "Feb", amount: 340 },
  { id: 3, rep: "Ben",  region: "EMEA", month: "Jan", amount: 90 },
  { id: 4, rep: "Ben",  region: "EMEA", month: "Feb", amount: 0 },
  { id: 5, rep: "Cara", region: "AMER", month: "Jan", amount: 260 },
  { id: 6, rep: "Cara", region: "AMER", month: "Feb", amount: 190 },
];

const SF_QUALIFY: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "QUALIFY & windows — Snowflake's signature clause",
    role: "A `sales` table with two months per rep. Every question here is 'per group, which rows?' — the shape QUALIFY was invented for.",
    goal: "Each cell is one SELECT using a window function, most of them filtered with QUALIFY instead of wrapping the query in a subquery. Independent reps; write each from memory.",
    outcome: "QUALIFY is to window functions what HAVING is to aggregates: it filters on a value that doesn't exist until after the window runs. Once it's in your fingers you stop writing dedupe subqueries.",
    setupCode: snowflakeSetup(SALES_ROWS, "sales"),
    dataset: SALES_ROWS,
    tableName: "sales",
  },
  cells: [
    { id: "rownum", task: "Select each rep and amount with a rank number per rep, best amount first, as rep, amount and rn (ordered by id).", why: "ROW_NUMBER over a partition is the building block every QUALIFY sits on.",
      focus: ["rep", "amount"], solution: `SELECT rep, amount, row_number() OVER (PARTITION BY rep ORDER BY amount DESC) AS rn FROM sales ORDER BY id`,
      assertions: expect([
        { rep: "Ann", amount: 120, rn: 2 }, { rep: "Ann", amount: 340, rn: 1 },
        { rep: "Ben", amount: 90, rn: 1 }, { rep: "Ben", amount: 0, rn: 2 },
        { rep: "Cara", amount: 260, rn: 1 }, { rep: "Cara", amount: 190, rn: 2 },
      ]),
      narrative: `PARTITION BY rep restarts the count for each rep, and ORDER BY amount DESC decides who is number 1 within that rep. The row order of the output is untouched — the number is just a new column.`,
      steps: [
        { do: "Restart per rep", code: `PARTITION BY rep` },
        { do: "Biggest amount first", code: `ORDER BY amount DESC` },
        { do: "Number the rows", code: `row_number() OVER (…)` },
      ] },
    { id: "best", task: "Select each rep's single best month — rep and amount — using QUALIFY (ordered by rep).", why: "The dedupe idiom: number the rows, keep number 1, no subquery.",
      focus: ["rep", "amount"], solution: `SELECT rep, amount FROM sales QUALIFY row_number() OVER (PARTITION BY rep ORDER BY amount DESC) = 1 ORDER BY rep`,
      assertions: expect([{ rep: "Ann", amount: 340 }, { rep: "Ben", amount: 90 }, { rep: "Cara", amount: 260 }]),
      narrative: `WHERE can't see a window function, because windows run after filtering. QUALIFY runs after them, so it can test the row number directly — this is the single most-typed Snowflake idiom.`,
      steps: [
        { do: "Number each rep's months", code: `row_number() OVER (PARTITION BY rep ORDER BY amount DESC)` },
        { do: "Keep only the top one", code: `QUALIFY … = 1` },
      ] },
    { id: "toptwo", task: "Select the top two amounts per region — region and amount — using QUALIFY and RANK (ordered by region, then amount descending).", why: "Top-N per group is the same idiom with a different cutoff.",
      focus: ["region", "amount"], solution: `SELECT region, amount FROM sales QUALIFY rank() OVER (PARTITION BY region ORDER BY amount DESC) <= 2 ORDER BY region, amount DESC`,
      assertions: expect([
        { region: "AMER", amount: 260 }, { region: "AMER", amount: 190 },
        { region: "EMEA", amount: 340 }, { region: "EMEA", amount: 120 },
      ]),
      narrative: `rank() numbers within each region, and QUALIFY … <= 2 keeps the first two. Swapping row_number() for rank() means genuine ties would both survive rather than one being dropped arbitrarily.`,
      steps: [
        { do: "Rank within the region", code: `rank() OVER (PARTITION BY region ORDER BY amount DESC)` },
        { do: "Keep the top two", code: `QUALIFY … <= 2` },
      ] },
    { id: "above", task: "Select the rows beating their region's average — rep and amount — using QUALIFY (ordered by id).", why: "QUALIFY filters on any window value, not just rankings.",
      focus: ["region", "amount"], solution: `SELECT rep, amount FROM sales QUALIFY amount > avg(amount) OVER (PARTITION BY region) ORDER BY id`,
      assertions: expect([{ rep: "Ann", amount: 340 }, { rep: "Cara", amount: 260 }]),
      narrative: `avg(amount) OVER (PARTITION BY region) computes each region's average without collapsing the rows, and QUALIFY compares every row against its own region's figure.`,
      steps: [
        { do: "Average within the region", code: `avg(amount) OVER (PARTITION BY region)` },
        { do: "Keep rows above it", code: `QUALIFY amount > …` },
      ] },
    { id: "lag", task: "Select each rep, month and the change from that rep's previous month, as rep, month and change (ordered by id).", why: "LAG reaches back a row — every month-on-month comparison starts here.",
      focus: ["rep", "month", "amount"], solution: `SELECT rep, month, amount - LAG(amount) OVER (PARTITION BY rep ORDER BY id) AS change FROM sales ORDER BY id`,
      assertions: expect([
        { rep: "Ann", month: "Jan", change: null }, { rep: "Ann", month: "Feb", change: 220 },
        { rep: "Ben", month: "Jan", change: null }, { rep: "Ben", month: "Feb", change: -90 },
        { rep: "Cara", month: "Jan", change: null }, { rep: "Cara", month: "Feb", change: -70 },
      ]),
      narrative: `LAG(amount) fetches the previous row's amount inside the same rep. January has no previous month, so the subtraction yields NULL rather than a misleading zero.`,
      steps: [
        { do: "Look back one row per rep", code: `LAG(amount) OVER (PARTITION BY rep ORDER BY id)` },
        { do: "Subtract to get the change", code: `amount - …` },
      ] },
    { id: "running", task: "Select each rep, month and their running total, as rep, month and cum (ordered by id).", why: "SUM over an ordered window is the running total — no self-join.",
      focus: ["rep", "amount"], solution: `SELECT rep, month, sum(amount) OVER (PARTITION BY rep ORDER BY id) AS cum FROM sales ORDER BY id`,
      assertions: expect([
        { rep: "Ann", month: "Jan", cum: 120 }, { rep: "Ann", month: "Feb", cum: 460 },
        { rep: "Ben", month: "Jan", cum: 90 }, { rep: "Ben", month: "Feb", cum: 90 },
        { rep: "Cara", month: "Jan", cum: 260 }, { rep: "Cara", month: "Feb", cum: 450 },
      ]),
      narrative: `Adding ORDER BY inside OVER turns the sum into a running one: each row totals everything up to and including itself, restarting at each new rep.`,
      steps: [
        { do: "Accumulate within the rep", code: `PARTITION BY rep ORDER BY id` },
        { do: "Running sum over that window", code: `sum(amount) OVER (…)` },
      ] },
    { id: "share", task: "Select each rep, month and that row's share of the grand total as a percentage to 1dp, as rep, month and share (ordered by id).", why: "An empty OVER () window is the whole table — the denominator for any share-of-total.",
      focus: ["amount"], solution: `SELECT rep, month, round(amount * 100.0 / sum(amount) OVER (), 1) AS share FROM sales ORDER BY id`,
      assertions: expect([
        { rep: "Ann", month: "Jan", share: 12 }, { rep: "Ann", month: "Feb", share: 34 },
        { rep: "Ben", month: "Jan", share: 9 }, { rep: "Ben", month: "Feb", share: 0 },
        { rep: "Cara", month: "Jan", share: 26 }, { rep: "Cara", month: "Feb", share: 19 },
      ]),
      narrative: `OVER () with nothing in it means "over every row", so sum(amount) OVER () is the grand total repeated on each row — exactly what you divide by for a percentage.`,
      steps: [
        { do: "Grand total on every row", code: `sum(amount) OVER ()` },
        { do: "Row over total, as a percent", code: `round(amount * 100.0 / …, 1)` },
      ] },
    { id: "ntile", task: "Select each rep, month and which half of the table the amount falls in, as rep, month and half (ordered by id).", why: "NTILE buckets rows into equal groups — quartiles, deciles, halves.",
      focus: ["amount"], solution: `SELECT rep, month, NTILE(2) OVER (ORDER BY amount DESC) AS half FROM sales ORDER BY id`,
      assertions: expect([
        { rep: "Ann", month: "Jan", half: 2 }, { rep: "Ann", month: "Feb", half: 1 },
        { rep: "Ben", month: "Jan", half: 2 }, { rep: "Ben", month: "Feb", half: 2 },
        { rep: "Cara", month: "Jan", half: 1 }, { rep: "Cara", month: "Feb", half: 1 },
      ]),
      narrative: `NTILE(2) sorts by amount descending and splits the six rows into two buckets of three, labelling the top three 1 and the bottom three 2.`,
      steps: [
        { do: "Order by size", code: `ORDER BY amount DESC` },
        { do: "Split into two buckets", code: `NTILE(2) OVER (…)` },
      ] },
    { id: "ignorenulls", task: "Select each id and the most recent non-zero amount so far, as id and last_real (ordered by id).", why: "IGNORE NULLS makes a window skip gaps instead of reporting them — the carry-forward fill.",
      focus: ["amount"], solution: `SELECT id, LAST_VALUE(NULLIFZERO(amount) IGNORE NULLS) OVER (ORDER BY id) AS last_real FROM sales ORDER BY id`,
      assertions: expect([
        { id: 1, last_real: 120 }, { id: 2, last_real: 340 }, { id: 3, last_real: 90 },
        { id: 4, last_real: 90 }, { id: 5, last_real: 260 }, { id: 6, last_real: 190 },
      ]),
      narrative: `NULLIFZERO turns the placeholder 0 into a NULL, and IGNORE NULLS tells LAST_VALUE to look past it — so row 4 carries row 3's 90 forward instead of reporting nothing.`,
      steps: [
        { do: "Treat zero as missing", code: `NULLIFZERO(amount)` },
        { do: "Take the last real value", code: `LAST_VALUE(… IGNORE NULLS) OVER (ORDER BY id)` },
      ] },
  ],
};

// ── Pack 3: Dates the Snowflake way (table invoices) ─────────────────────────
const INVOICE_ROWS: DataRow[] = [
  { id: 1, client: "Acme",   issued: "2026-01-05", amount: 1200 },
  { id: 2, client: "Beta",   issued: "2026-01-31", amount: 450 },
  { id: 3, client: "Corvid", issued: "2026-02-14", amount: 890 },
  { id: 4, client: "Delta",  issued: "2026-03-02", amount: 300 },
  { id: 5, client: "Acme",   issued: "2026-03-28", amount: 1750 },
  { id: 6, client: "Beta",   issued: "2026-04-11", amount: 620 },
];

const SF_DATES: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Dates the Snowflake way — TO_DATE, DATEADD, DATEDIFF",
    role: "An `invoices` table where the issue date arrived as text. Everything downstream — ageing, due dates, monthly rollups — starts by making it a real date.",
    goal: "Each cell is one SELECT using Snowflake's date functions: TO_DATE, TO_VARCHAR, DATEADD, DATEDIFF, DATE_TRUNC, LAST_DAY, DATE_PART. Independent reps; write each from memory.",
    outcome: "Snowflake's date functions take the unit as an argument — DATEADD('month', 1, d) — rather than as syntax. Learn the unit strings once and the whole family falls into place.",
    setupCode: snowflakeSetup(INVOICE_ROWS, "invoices"),
    dataset: INVOICE_ROWS,
    tableName: "invoices",
  },
  cells: [
    { id: "todate", task: "Select each client and its issue date as a real date rendered back as text, as client and issued (ordered by id).", why: "TO_DATE is the front door: text in, DATE out, everything else depends on it.",
      focus: ["client", "issued"], solution: `SELECT client, TO_DATE(issued)::VARCHAR AS issued FROM invoices ORDER BY id`,
      assertions: expect([
        { client: "Acme", issued: "2026-01-05" }, { client: "Beta", issued: "2026-01-31" },
        { client: "Corvid", issued: "2026-02-14" }, { client: "Delta", issued: "2026-03-02" },
        { client: "Acme", issued: "2026-03-28" }, { client: "Beta", issued: "2026-04-11" },
      ]),
      narrative: `TO_DATE(issued) parses the text into a DATE; the trailing ::VARCHAR renders it back for display. Without the parse, every date function below would refuse the column.`,
      steps: [
        { do: "Parse the text as a date", code: `TO_DATE(issued)` },
        { do: "Render it back as text", code: `::VARCHAR` },
      ] },
    { id: "month", task: "Select each invoice's year and month as YYYY-MM, as month (ordered by id).", why: "TO_VARCHAR with a format string is how Snowflake makes a month bucket.",
      focus: ["issued"], solution: `SELECT TO_VARCHAR(TO_DATE(issued), 'YYYY-MM') AS month FROM invoices ORDER BY id`,
      assertions: expect(["2026-01","2026-01","2026-02","2026-03","2026-03","2026-04"].map(month => ({ month }))),
      narrative: `TO_VARCHAR(date, format) formats a date using Snowflake's format tokens. 'YYYY-MM' drops the day, which is exactly what a monthly grouping key needs.`,
      steps: [
        { do: "Make it a date", code: `TO_DATE(issued)` },
        { do: "Format year and month", code: `TO_VARCHAR(…, 'YYYY-MM')` },
      ] },
    { id: "due", task: "Select each invoice's due date — 30 days after issue — as due, rendered as text (ordered by id).", why: "DATEADD takes the unit as a string argument, which trips up everyone arriving from other dialects.",
      focus: ["issued"], solution: `SELECT DATEADD('day', 30, TO_DATE(issued))::VARCHAR AS due FROM invoices ORDER BY id`,
      assertions: expect(["2026-02-04","2026-03-02","2026-03-16","2026-04-01","2026-04-27","2026-05-11"].map(due => ({ due }))),
      narrative: `DATEADD(unit, amount, date) reads in that order — unit first. Swapping to 'month' or 'year' changes nothing else about the call, which is the point of the design.`,
      steps: [
        { do: "Unit, then amount, then date", code: `DATEADD('day', 30, TO_DATE(issued))` },
        { do: "Render as text", code: `::VARCHAR` },
      ] },
    { id: "age", task: "Select each invoice's age in days at 2026-05-01, as days (ordered by id).", why: "DATEDIFF is the same shape as DATEADD — unit first, then the two dates.",
      focus: ["issued"], solution: `SELECT DATEDIFF('day', TO_DATE(issued), TO_DATE('2026-05-01')) AS days FROM invoices ORDER BY id`,
      assertions: expect([{ days: 116 }, { days: 90 }, { days: 76 }, { days: 60 }, { days: 34 }, { days: 20 }]),
      narrative: `DATEDIFF(unit, start, end) counts whole units from the first date to the second, so the earliest invoice returns the largest number — its age.`,
      steps: [
        { do: "Count days between", code: `DATEDIFF('day', TO_DATE(issued), …)` },
        { do: "Against a fixed date", code: `TO_DATE('2026-05-01')` },
      ] },
    { id: "monthstart", task: "Select the first day of each invoice's month as text, as month_start (ordered by id).", why: "DATE_TRUNC snaps a date down to the start of its period — the standard bucketing move.",
      focus: ["issued"], solution: `SELECT TO_VARCHAR(DATE_TRUNC('month', TO_DATE(issued)), 'YYYY-MM-DD') AS month_start FROM invoices ORDER BY id`,
      assertions: expect(["2026-01-01","2026-01-01","2026-02-01","2026-03-01","2026-03-01","2026-04-01"].map(month_start => ({ month_start }))),
      narrative: `DATE_TRUNC('month', d) throws away everything finer than the month, landing on the 1st. Unlike a formatted string it stays a real date, so you can still do arithmetic on it.`,
      steps: [
        { do: "Snap down to the month", code: `DATE_TRUNC('month', TO_DATE(issued))` },
        { do: "Render as a date string", code: `TO_VARCHAR(…, 'YYYY-MM-DD')` },
      ] },
    { id: "monthend", task: "Select the last day of each invoice's month as text, as month_end (ordered by id).", why: "LAST_DAY handles month lengths and leap years so you never hardcode 30 or 31.",
      focus: ["issued"], solution: `SELECT LAST_DAY(TO_DATE(issued))::VARCHAR AS month_end FROM invoices ORDER BY id`,
      assertions: expect(["2026-01-31","2026-01-31","2026-02-28","2026-03-31","2026-03-31","2026-04-30"].map(month_end => ({ month_end }))),
      narrative: `LAST_DAY(d) returns the final day of that date's month — 31st, 30th or 28th as appropriate — which is what a period-end close date actually needs.`,
      steps: [
        { do: "Jump to month end", code: `LAST_DAY(TO_DATE(issued))` },
        { do: "Render as text", code: `::VARCHAR` },
      ] },
    { id: "quarter", task: "Select each invoice's calendar quarter as a number, as q (ordered by id).", why: "DATE_PART pulls one component out of a date — quarter, month, dayofweek, whatever you name.",
      focus: ["issued"], solution: `SELECT DATE_PART('quarter', TO_DATE(issued)) AS q FROM invoices ORDER BY id`,
      assertions: expect([{ q: 1 }, { q: 1 }, { q: 1 }, { q: 1 }, { q: 1 }, { q: 2 }]),
      narrative: `DATE_PART(unit, date) extracts a single field as a number. April is the first month of Q2, so the last invoice is the only one that breaks from 1.`,
      steps: [{ do: "Extract the quarter", code: `DATE_PART('quarter', TO_DATE(issued))` }] },
    { id: "bymonth", task: "Select each YYYY-MM month and its invoiced total, as month and total, using GROUP BY ALL (ordered by month).", why: "Format the bucket, group by all, order by the bucket — the monthly rollup in three moves.",
      focus: ["issued", "amount"], solution: `SELECT TO_VARCHAR(TO_DATE(issued), 'YYYY-MM') AS month, sum(amount) AS total FROM invoices GROUP BY ALL ORDER BY month`,
      assertions: expect([
        { month: "2026-01", total: 1650 }, { month: "2026-02", total: 890 },
        { month: "2026-03", total: 2050 }, { month: "2026-04", total: 620 },
      ]),
      narrative: `The formatted month is the grouping key, and because 'YYYY-MM' sorts the same way the calendar does, ORDER BY month gives chronological output for free.`,
      steps: [
        { do: "Bucket by month", code: `TO_VARCHAR(TO_DATE(issued), 'YYYY-MM') AS month` },
        { do: "Total each bucket", code: `sum(amount), GROUP BY ALL` },
      ] },
    { id: "overdue", task: "Select each client and whether the invoice was over 60 days old at 2026-05-01 — 'overdue' or 'ok' — as client and state (ordered by id).", why: "Combining DATEDIFF with IFF is the everyday ageing flag.",
      focus: ["client", "issued"], solution: `SELECT client, IFF(DATEDIFF('day', TO_DATE(issued), TO_DATE('2026-05-01')) > 60, 'overdue', 'ok') AS state FROM invoices ORDER BY id`,
      assertions: expect([
        { client: "Acme", state: "overdue" }, { client: "Beta", state: "overdue" },
        { client: "Corvid", state: "overdue" }, { client: "Delta", state: "ok" },
        { client: "Acme", state: "ok" }, { client: "Beta", state: "ok" },
      ]),
      narrative: `DATEDIFF produces the age in days and IFF turns it into a label. The 60-day invoice is 'ok' because the test is strictly greater than — boundaries are where ageing rules get argued about.`,
      steps: [
        { do: "Age it in days", code: `DATEDIFF('day', TO_DATE(issued), TO_DATE('2026-05-01'))` },
        { do: "Label either side of 60", code: `IFF(… > 60, 'overdue', 'ok')` },
      ] },
  ],
};

// ── Pack 4: Semi-structured data (table events) ──────────────────────────────
//
// Snowflake's `:` path shorthand (payload:channel) and LATERAL FLATTEN cannot
// parse on this engine, so this pack drills the FUNCTION forms of the same
// operations — JSON_EXTRACT_PATH_TEXT, GET_PATH, SPLIT, ARRAY_* — all of which
// are genuine Snowflake and all of which run here honestly.
const EVENT_ROWS: DataRow[] = [
  { id: 1, account: "ann",  payload: `{"channel":"web","plan":"pro","items":3}`,  tags: "billing,urgent" },
  { id: 2, account: "ben",  payload: `{"channel":"app","plan":"free","items":1}`, tags: "onboarding" },
  { id: 3, account: "cara", payload: `{"channel":"web","plan":"free","items":0}`, tags: "billing" },
  { id: 4, account: "dan",  payload: `{"channel":"api","plan":"pro","items":7}`,  tags: "urgent,api,billing" },
];

const SF_SEMI: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Semi-structured data — JSON and arrays in Snowflake",
    role: "An `events` table where each row carries a JSON `payload` and a comma-delimited `tags` string. Reading inside those without unpacking them first is the whole point of Snowflake's semi-structured support.",
    goal: "Each cell is one SELECT reaching into JSON or splitting a delimited string — JSON_EXTRACT_PATH_TEXT, PARSE_JSON, GET_PATH, SPLIT, SPLIT_PART, ARRAY_SIZE, ARRAY_CONTAINS, ARRAY_AGG, OBJECT_CONSTRUCT. Independent reps; write each from memory.",
    outcome: "In a real worksheet you'd more often write the `payload:channel` path shorthand, and LATERAL FLATTEN to explode an array into rows. Neither can run on this engine, so they aren't drilled here — but the function forms above are the same operations, are valid Snowflake, and are what you'd reach for when a path expression won't do.",
    setupCode: snowflakeSetup(EVENT_ROWS, "events"),
    dataset: EVENT_ROWS,
    tableName: "events",
  },
  cells: [
    { id: "channel", task: "Select each event's channel out of the JSON payload, as channel (ordered by id).", why: "JSON_EXTRACT_PATH_TEXT reads one key out of a JSON string and hands back plain text.",
      focus: ["payload"], solution: `SELECT JSON_EXTRACT_PATH_TEXT(payload, 'channel') AS channel FROM events ORDER BY id`,
      assertions: expect(["web","app","web","api"].map(channel => ({ channel }))),
      narrative: `JSON_EXTRACT_PATH_TEXT(json, path) walks into the document and returns the value as VARCHAR — no quotes around it, ready to compare or group by.`,
      steps: [{ do: "Pull one key out as text", code: `JSON_EXTRACT_PATH_TEXT(payload, 'channel')` }] },
    { id: "plan", task: "Select each event's plan by parsing the payload first, as plan (ordered by id).", why: "PARSE_JSON turns text into a VARIANT; GET_PATH navigates it.",
      focus: ["payload"], solution: `SELECT GET_PATH(PARSE_JSON(payload), 'plan') AS plan FROM events ORDER BY id`,
      assertions: expect(["pro","free","free","pro"].map(plan => ({ plan }))),
      narrative: `PARSE_JSON(payload) converts the string into a real JSON value, and GET_PATH picks a key out of it — the two-step form of the same read, useful when you need the parsed document more than once.`,
      steps: [
        { do: "Parse the text into JSON", code: `PARSE_JSON(payload)` },
        { do: "Navigate to the key", code: `GET_PATH(…, 'plan')` },
      ] },
    { id: "items", task: "Select each event's item count as a number, as items (ordered by id).", why: "JSON values arrive as text — cast them or every comparison is a string comparison.",
      focus: ["payload"], solution: `SELECT JSON_EXTRACT_PATH_TEXT(payload, 'items')::INTEGER AS items FROM events ORDER BY id`,
      assertions: expect([{ items: 3 }, { items: 1 }, { items: 0 }, { items: 7 }]),
      narrative: `The extract returns '3' as text, which would sort before '10'. The ::INTEGER cast makes it a real number, and that cast is the step people forget.`,
      steps: [
        { do: "Read the key", code: `JSON_EXTRACT_PATH_TEXT(payload, 'items')` },
        { do: "Make it numeric", code: `::INTEGER` },
      ] },
    { id: "pro", task: "Count the events on the pro plan, as n.", why: "A JSON field filters exactly like a column once you've extracted it.",
      focus: ["payload"], solution: `SELECT count(*) AS n FROM events WHERE JSON_EXTRACT_PATH_TEXT(payload, 'plan') = 'pro'`,
      assertions: expect([{ n: 2 }]),
      narrative: `The extraction happens per row inside the WHERE, so the JSON key behaves like any other predicate — no unpacking step, no staging table.`,
      steps: [
        { do: "Extract the plan per row", code: `JSON_EXTRACT_PATH_TEXT(payload, 'plan')` },
        { do: "Filter and count", code: `WHERE … = 'pro'` },
      ] },
    { id: "firsttag", task: "Select each event's first tag, as first_tag (ordered by id).", why: "SPLIT_PART grabs one delimited field without building the whole array.",
      focus: ["tags"], solution: `SELECT SPLIT_PART(tags, ',', 1) AS first_tag FROM events ORDER BY id`,
      assertions: expect(["billing","onboarding","billing","urgent"].map(first_tag => ({ first_tag }))),
      narrative: `SPLIT_PART(string, delimiter, n) returns the nth field, counting from 1. It's the cheap read when you only want one piece of a delimited value.`,
      steps: [{ do: "Take the first field", code: `SPLIT_PART(tags, ',', 1)` }] },
    { id: "tagcount", task: "Select how many tags each event carries, as n (ordered by id).", why: "SPLIT makes an array; ARRAY_SIZE measures it.",
      focus: ["tags"], solution: `SELECT ARRAY_SIZE(SPLIT(tags, ',')) AS n FROM events ORDER BY id`,
      assertions: expect([{ n: 2 }, { n: 1 }, { n: 1 }, { n: 3 }]),
      narrative: `SPLIT returns the delimited string as an array of values, and ARRAY_SIZE counts its elements — the pair you use whenever a column holds a list.`,
      steps: [
        { do: "Split into an array", code: `SPLIT(tags, ',')` },
        { do: "Count the elements", code: `ARRAY_SIZE(…)` },
      ] },
    { id: "hasbilling", task: "Select whether each event is tagged billing, as billing (ordered by id).", why: "ARRAY_CONTAINS is an exact membership test — LIKE '%billing%' would match a longer tag by accident.",
      focus: ["tags"], solution: `SELECT ARRAY_CONTAINS('billing', SPLIT(tags, ',')) AS billing FROM events ORDER BY id`,
      assertions: expect([{ billing: true }, { billing: false }, { billing: true }, { billing: true }]),
      narrative: `ARRAY_CONTAINS(value, array) takes the value FIRST and the array second — the opposite of most dialects, and worth burning in. Splitting first means it compares whole tags, not substrings.`,
      steps: [
        { do: "Split the tags", code: `SPLIT(tags, ',')` },
        { do: "Test membership — value first", code: `ARRAY_CONTAINS('billing', …)` },
      ] },
    { id: "bychannel", task: "Select each channel and its accounts joined by ', ', as channel and accounts (ordered by channel).", why: "ARRAY_AGG collects a group into an array; ARRAY_TO_STRING makes it readable.",
      focus: ["account", "payload"], solution: `SELECT JSON_EXTRACT_PATH_TEXT(payload, 'channel') AS channel, ARRAY_TO_STRING(ARRAY_AGG(account), ', ') AS accounts FROM events GROUP BY ALL ORDER BY channel`,
      assertions: expect([
        { channel: "api", accounts: "dan" }, { channel: "app", accounts: "ben" },
        { channel: "web", accounts: "ann, cara" },
      ]),
      narrative: `ARRAY_AGG gathers each group's accounts into an array, and ARRAY_TO_STRING flattens that array to a delimited string — the array-native route to the same place LISTAGG gets to.`,
      steps: [
        { do: "Group by the JSON channel", code: `JSON_EXTRACT_PATH_TEXT(payload, 'channel'), GROUP BY ALL` },
        { do: "Collect, then join", code: `ARRAY_TO_STRING(ARRAY_AGG(account), ', ')` },
      ] },
    { id: "profile", task: "Select a JSON object per event holding its account and channel, as profile rendered as text (ordered by id).", why: "OBJECT_CONSTRUCT builds JSON on the way out — the mirror of parsing it on the way in.",
      focus: ["account", "payload"], solution: `SELECT OBJECT_CONSTRUCT('account', account, 'channel', JSON_EXTRACT_PATH_TEXT(payload, 'channel'))::VARCHAR AS profile FROM events ORDER BY id`,
      assertions: expect([
        { profile: `{"account":"ann","channel":"web"}` }, { profile: `{"account":"ben","channel":"app"}` },
        { profile: `{"account":"cara","channel":"web"}` }, { profile: `{"account":"dan","channel":"api"}` },
      ]),
      narrative: `OBJECT_CONSTRUCT takes alternating keys and values and returns a JSON object, so a query can emit semi-structured output as easily as it consumes it.`,
      steps: [
        { do: "Pair keys with values", code: `OBJECT_CONSTRUCT('account', account, 'channel', …)` },
        { do: "Render it as text", code: `::VARCHAR` },
      ] },
  ],
};

// ── Pack 5: Reshape & load (table stock) ─────────────────────────────────────
const STOCK_ROWS: DataRow[] = [
  { id: 1, sku: "A1", region: "EMEA", units: 10, cost: 4.5 },
  { id: 2, sku: "A1", region: "AMER", units: 4,  cost: 4.5 },
  { id: 3, sku: "B2", region: "EMEA", units: 7,  cost: 9.0 },
  { id: 4, sku: "B2", region: "AMER", units: 12, cost: 9.0 },
  { id: 5, sku: "C3", region: "EMEA", units: 0,  cost: 2.25 },
];

const SF_TRANSFORM: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Reshape & load — MERGE, PIVOT, EXCLUDE",
    role: "A `stock` table, one row per SKU per region. These are the moves that write to a table rather than just read from one — the transform half of a Snowflake pipeline.",
    goal: "Each cell is one statement (or a write followed by a read, so you can see what changed): SELECT * EXCLUDE, PIVOT, CTEs, CREATE TABLE AS, and MERGE in both its matched and not-matched forms. Independent reps; the table is rebuilt fresh before each one.",
    outcome: "MERGE is the upsert every incremental load is built on, and PIVOT is how a long table becomes a report. Both are statements you'll write far more often than you'd guess from how rarely tutorials cover them.",
    setupCode: snowflakeSetup(STOCK_ROWS, "stock"),
    dataset: STOCK_ROWS,
    tableName: "stock",
  },
  cells: [
    { id: "exclude", task: "Select every column except cost, as they are (ordered by id).", why: "SELECT * EXCLUDE drops a column without naming the twenty you're keeping.",
      focus: ["cost"], solution: `SELECT * EXCLUDE (cost) FROM stock ORDER BY id`,
      assertions: expect([
        { id: 1, sku: "A1", region: "EMEA", units: 10 }, { id: 2, sku: "A1", region: "AMER", units: 4 },
        { id: 3, sku: "B2", region: "EMEA", units: 7 }, { id: 4, sku: "B2", region: "AMER", units: 12 },
        { id: 5, sku: "C3", region: "EMEA", units: 0 },
      ]),
      narrative: `SELECT * EXCLUDE (col) keeps the star's convenience while dropping what you don't want — the usual way to hide a sensitive or noisy column from a view.`,
      steps: [{ do: "Star, minus one column", code: `SELECT * EXCLUDE (cost)` }] },
    { id: "value", task: "Select each SKU and the total value of its stock — units times cost — as sku and value, using GROUP BY ALL (ordered by sku).", why: "Aggregating a computed expression is the everyday rollup.",
      focus: ["sku", "units", "cost"], solution: `SELECT sku, sum(units * cost) AS value FROM stock GROUP BY ALL ORDER BY sku`,
      assertions: expect([{ sku: "A1", value: 63 }, { sku: "B2", value: 171 }, { sku: "C3", value: 0 }]),
      narrative: `units * cost is evaluated per row and then summed per SKU. GROUP BY ALL picks up sku as the grouping key because it's the only column that isn't aggregated.`,
      steps: [
        { do: "Value each row", code: `units * cost` },
        { do: "Total per SKU", code: `sum(…), GROUP BY ALL` },
      ] },
    { id: "pivot", task: "Pivot units into one column per region — EMEA and AMER — for each SKU (ordered by sku).", why: "PIVOT turns a long table into the wide shape a report wants.",
      focus: ["sku", "region", "units"], solution: `SELECT * FROM (SELECT sku, region, units FROM stock) PIVOT (sum(units) FOR region IN ('EMEA', 'AMER')) ORDER BY sku`,
      assertions: expect([
        { sku: "A1", EMEA: 10, AMER: 4 }, { sku: "B2", EMEA: 7, AMER: 12 }, { sku: "C3", EMEA: 0, AMER: null },
      ]),
      narrative: `PIVOT names the aggregate, the column whose values become headings, and the list of values to turn into columns. Anything not present — C3 in AMER — comes back NULL rather than zero.`,
      steps: [
        { do: "Feed it just the three columns", code: `(SELECT sku, region, units FROM stock)` },
        { do: "Aggregate, pivoting on region", code: `PIVOT (sum(units) FOR region IN ('EMEA', 'AMER'))` },
      ] },
    { id: "cte", task: "Using a CTE of each SKU's total units, select the SKUs holding more than 10 units, as sku and units (ordered by sku).", why: "A CTE names an intermediate result so the outer query reads like a sentence.",
      focus: ["sku", "units"], solution: `WITH totals AS (SELECT sku, sum(units) AS units FROM stock GROUP BY ALL) SELECT sku, units FROM totals WHERE units > 10 ORDER BY sku`,
      assertions: expect([{ sku: "A1", units: 14 }, { sku: "B2", units: 19 }]),
      narrative: `WITH totals AS (…) computes the per-SKU sums once and gives them a name; the outer SELECT then filters that named result, which a WHERE couldn't have done against the raw aggregate.`,
      steps: [
        { do: "Name the aggregate", code: `WITH totals AS (SELECT sku, sum(units) AS units …)` },
        { do: "Filter the named result", code: `SELECT … FROM totals WHERE units > 10` },
      ] },
    { id: "ctas", task: "Create a temporary table low holding the SKUs with fewer than 8 units, then select its sku and units (ordered by sku).", why: "CREATE TABLE AS SELECT is how a pipeline stage materialises its output.",
      focus: ["sku", "units"], solution: `CREATE OR REPLACE TEMP TABLE low AS SELECT sku, sum(units) AS units FROM stock GROUP BY ALL HAVING sum(units) < 8;\nSELECT sku, units FROM low ORDER BY sku`,
      assertions: expect([{ sku: "C3", units: 0 }]),
      narrative: `CTAS runs the query and stores its result as a new table in one statement. TEMP scopes it to the session, which is what you want for a working set nothing downstream should depend on.`,
      steps: [
        { do: "Materialise the query", code: `CREATE OR REPLACE TEMP TABLE low AS SELECT …` },
        { do: "Read it back", code: `SELECT sku, units FROM low` },
      ] },
    { id: "mergeupdate", task: "Merge a corrected count of 25 units for row 1 into stock, then select id and units (ordered by id).", why: "WHEN MATCHED THEN UPDATE is the update half of an upsert.",
      focus: ["id", "units"], solution: `MERGE INTO stock t USING (SELECT 1 AS id, 25 AS units) s ON t.id = s.id WHEN MATCHED THEN UPDATE SET units = s.units;\nSELECT id, units FROM stock ORDER BY id`,
      assertions: expect([{ id: 1, units: 25 }, { id: 2, units: 4 }, { id: 3, units: 7 }, { id: 4, units: 12 }, { id: 5, units: 0 }]),
      narrative: `MERGE joins the target to a source on the ON condition, and every matched row takes the branch you wrote. Only row 1 matches, so only row 1 changes.`,
      steps: [
        { do: "Join target to source", code: `MERGE INTO stock t USING (…) s ON t.id = s.id` },
        { do: "Update what matched", code: `WHEN MATCHED THEN UPDATE SET units = s.units` },
      ] },
    { id: "mergeupsert", task: "Merge a source of row 5 at 30 units and a new row 6 (sku D4, AMER, 2 units, cost 1) into stock, then select id and units (ordered by id).", why: "MATCHED plus NOT MATCHED in one statement is the upsert — the backbone of every incremental load.",
      focus: ["id", "units"], solution: `MERGE INTO stock t USING (SELECT 5 AS id, 'C3' AS sku, 'EMEA' AS region, 30 AS units, 2.25 AS cost UNION ALL SELECT 6, 'D4', 'AMER', 2, 1.0) s ON t.id = s.id WHEN MATCHED THEN UPDATE SET units = s.units WHEN NOT MATCHED THEN INSERT (id, sku, region, units, cost) VALUES (s.id, s.sku, s.region, s.units, s.cost);\nSELECT id, units FROM stock ORDER BY id`,
      assertions: expect([{ id: 1, units: 10 }, { id: 2, units: 4 }, { id: 3, units: 7 }, { id: 4, units: 12 }, { id: 5, units: 30 }, { id: 6, units: 2 }]),
      narrative: `One pass over the source handles both cases: id 5 already exists so it's updated, id 6 doesn't so it's inserted. Writing this as a DELETE plus an INSERT is how duplicate loads happen.`,
      steps: [
        { do: "Two rows of source data", code: `SELECT 5, … UNION ALL SELECT 6, …` },
        { do: "Update the hit", code: `WHEN MATCHED THEN UPDATE SET units = s.units` },
        { do: "Insert the miss", code: `WHEN NOT MATCHED THEN INSERT (…) VALUES (…)` },
      ] },
  ],
};

export const SNOWFLAKE_PACKS: DrillPack[] = [
  { id: "snowflake-essentials", title: "Snowflake essentials",  blurb: "The everyday functions — IFF, NVL, ZEROIFNULL, DIV0, DECODE, TRY_TO_NUMBER, ILIKE.", tag: "Snowflake", lang: "sql", content: SF_ESSENTIALS },
  { id: "snowflake-qualify",    title: "QUALIFY & windows",     blurb: "Snowflake's signature clause — dedupe, top-N per group, running totals, IGNORE NULLS.", tag: "Snowflake", lang: "sql", content: SF_QUALIFY },
  { id: "snowflake-dates",      title: "Dates the Snowflake way", blurb: "TO_DATE, DATEADD, DATEDIFF, DATE_TRUNC, LAST_DAY — the unit-first date family.", tag: "Snowflake", lang: "sql", content: SF_DATES },
  { id: "snowflake-semistructured", title: "Semi-structured data", blurb: "JSON and arrays — PARSE_JSON, GET_PATH, SPLIT, ARRAY_SIZE, OBJECT_CONSTRUCT.", tag: "Snowflake", lang: "sql", content: SF_SEMI },
  { id: "snowflake-transform",  title: "Reshape & load",        blurb: "The write side — MERGE upserts, PIVOT, CTAS, SELECT * EXCLUDE.", tag: "Snowflake", lang: "sql", content: SF_TRANSFORM },
];
