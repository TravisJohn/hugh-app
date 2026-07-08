// Curated SQL practice packs — the SQL counterpart to the Python packs.
//
// Same DrillPack / DrillContent shape, but `lang: "sql"`: cells run against
// DuckDB-wasm and each is a SELECT whose result set must match the expected rows
// (the cell's `assertions` field holds that expected set as JSON). Datasets are
// the same small tables as the Python packs, loaded via CREATE TABLE + INSERT
// (derived from the structured rows by sqlSetupFromRows), each with an `id`
// column so ORDER BY makes results deterministic.
//
// Scope is trimmed to what SQL does cleanly: cleaning/reshaping, profiling,
// chart-data prep (window functions), regression via DuckDB's regr_* built-ins,
// and the window-friendly parts of forecasting. Every query + expected result
// was verified against real DuckDB before shipping.

import { sqlSetupFromRows, type DataRow, type DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

/** Expected result set → the JSON string stored in a cell's `assertions`. */
const expect = (rows: Array<Record<string, string | number | boolean | null>>): string =>
  JSON.stringify(rows);

// ── Pack 1: Clean & shape (table people) ───────────────────────────────────
const PEOPLE_ROWS: DataRow[] = [
  { id: 1, name: " Ann ", city: "london", amount: "30", status: "active" },
  { id: 2, name: "Ben",   city: "LONDON", amount: "50", status: "active" },
  { id: 3, name: "Cara ", city: "Paris",  amount: "20", status: "ACTIVE" },
  { id: 4, name: "Dan",   city: "paris",  amount: "70", status: "inactive" },
  { id: 5, name: " Eve",  city: "London", amount: "0",  status: "active" },
  { id: 6, name: "Finn",  city: "paris",  amount: "50", status: "Inactive" },
];

const SQL_CLEAN: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Clean & shape data — tidy a messy table (SQL)",
    role: "The `people` table came in dirty: stray spaces, inconsistent case, amounts stored as text. Query it clean.",
    goal: "Each cell is one SELECT that tidies the `people` table — TRIM, LOWER, CAST, WHERE, DISTINCT, CASE, aliases. Independent reps; write each from memory.",
    outcome: "That's the SQL tidy-up toolkit — trim, lower, cast, filter, dedupe, CASE, rename. The cleaning happens in the SELECT.",
    setupCode: sqlSetupFromRows(PEOPLE_ROWS, "people"),
    dataset: PEOPLE_ROWS,
    tableName: "people",
  },
  cells: [
    { id: "trim", task: "Select each name with its surrounding spaces removed, as name (ordered by id).", why: "TRIM() strips whitespace — the most common dirt in text columns.",
      focus: ["name"], solution: `SELECT trim(name) AS name FROM people ORDER BY id`,
      assertions: expect(["Ann","Ben","Cara","Dan","Eve","Finn"].map(name => ({ name }))),
      narrative: `trim(name) shaves the spaces off both ends of each value; AS name labels the output column; ORDER BY id keeps the original order.`,
      steps: [
        { do: "Strip the spaces off each name", code: `trim(name) AS name` },
        { do: "From the people table", code: `FROM people` },
        { do: "Keep the original order", code: `ORDER BY id` },
      ] },
    { id: "lower", task: "Select each city lowercased, as city (ordered by id).", why: "LOWER() normalises case so \"London\" and \"LONDON\" stop counting as different.",
      focus: ["city"], solution: `SELECT lower(city) AS city FROM people ORDER BY id`,
      assertions: expect(["london","london","paris","paris","london","paris"].map(city => ({ city }))),
      narrative: `lower(city) forces every city into the same case, collapsing mixed capitals to one canonical value.`,
      steps: [
        { do: "Lowercase each city", code: `lower(city) AS city` },
        { do: "From the people table", code: `FROM people` },
      ] },
    { id: "cast", task: "Select each amount converted to an integer, as amount (ordered by id).", why: "CAST(... AS INTEGER) turns text-numbers into real numbers you can compute with.",
      focus: ["amount"], solution: `SELECT CAST(amount AS INTEGER) AS amount FROM people ORDER BY id`,
      assertions: expect([30,50,20,70,0,50].map(amount => ({ amount }))),
      narrative: `The amounts are stored as text. CAST(amount AS INTEGER) converts each one so it can be summed, compared, or averaged.`,
      steps: [
        { do: "Convert the text to an integer", code: `CAST(amount AS INTEGER) AS amount` },
        { do: "From the people table", code: `FROM people` },
      ] },
    { id: "total", task: "Select the sum of all amounts (converted to int), as total.", why: "Aggregate the cast column — cleaning and totalling in one query.",
      focus: ["amount"], solution: `SELECT sum(CAST(amount AS INTEGER)) AS total FROM people`,
      assertions: expect([{ total: 220 }]),
      narrative: `sum() aggregates over every row; casting inside it converts each amount before it's added, so you total the numbers, not the strings.`,
      steps: [
        { do: "Cast each amount, then sum", code: `sum(CAST(amount AS INTEGER))` },
        { do: "From the people table", code: `FROM people` },
      ] },
    { id: "nonzero", task: "Count the rows whose amount (as int) is above zero, as n.", why: "WHERE filters rows before aggregating — the everyday way to exclude empties.",
      focus: ["amount"], solution: `SELECT count(*) AS n FROM people WHERE CAST(amount AS INTEGER) > 0`,
      assertions: expect([{ n: 5 }]),
      narrative: `WHERE keeps only rows that pass its test — here amount above zero — and count(*) tallies what survives, so the empty (0) record is excluded.`,
      steps: [
        { do: "Count the surviving rows", code: `count(*) AS n` },
        { do: "Keep only rows above zero", code: `WHERE CAST(amount AS INTEGER) > 0` },
      ] },
    { id: "distinct", task: "Select the distinct lowercased cities, as city (ordered alphabetically).", why: "DISTINCT dedupes; normalise first or the casing splits your uniques.",
      focus: ["city"], solution: `SELECT DISTINCT lower(city) AS city FROM people ORDER BY city`,
      assertions: expect([{ city: "london" }, { city: "paris" }]),
      narrative: `Lowercasing first collapses "London"/"LONDON"; DISTINCT then drops the duplicates; ORDER BY sorts what's left.`,
      steps: [
        { do: "Lowercase, then keep distinct values", code: `DISTINCT lower(city) AS city` },
        { do: "Order them alphabetically", code: `ORDER BY city` },
      ] },
    { id: "active", task: `Select "yes" when the status (trimmed, lowered) is 'active' else "no", as active (ordered by id).`, why: "CASE turns a messy label into a clean, consistent flag.",
      focus: ["status"], solution: `SELECT CASE WHEN lower(trim(status)) = 'active' THEN 'yes' ELSE 'no' END AS active FROM people ORDER BY id`,
      assertions: expect(["yes","yes","yes","no","yes","no"].map(active => ({ active }))),
      narrative: `lower(trim(status)) flattens the inconsistent casing; the CASE expression tests it and emits a clean "yes"/"no" per row.`,
      steps: [
        { do: "Normalise the status text", code: `lower(trim(status))` },
        { do: "Emit yes/no by the test", code: `CASE WHEN … = 'active' THEN 'yes' ELSE 'no' END` },
      ] },
    { id: "clean", task: "Select a tidy row per person: name trimmed, city lowered, amount as int (ordered by id).", why: "Projecting several cleaned columns at once is the heart of reshaping.",
      focus: ["name", "city", "amount"], solution: `SELECT trim(name) AS name, lower(city) AS city, CAST(amount AS INTEGER) AS amount FROM people ORDER BY id`,
      assertions: expect([
        { name: "Ann", city: "london", amount: 30 }, { name: "Ben", city: "london", amount: 50 },
        { name: "Cara", city: "paris", amount: 20 }, { name: "Dan", city: "paris", amount: 70 },
        { name: "Eve", city: "london", amount: 0 }, { name: "Finn", city: "paris", amount: 50 },
      ]),
      narrative: `One SELECT can clean every field at once — each expression fixes its column and AS names it — producing a fully tidy table.`,
      steps: [
        { do: "Clean each column in the projection", code: `trim(name), lower(city), CAST(amount AS INTEGER)` },
        { do: "Alias each result column", code: `AS name, AS city, AS amount` },
      ] },
    { id: "big", task: `Select each trimmed name and "yes"/"no" for amount ≥ 50, as name and big (ordered by id).`, why: "A derived flag column beside the data — routine feature work with CASE.",
      focus: ["name", "amount"], solution: `SELECT trim(name) AS name, CASE WHEN CAST(amount AS INTEGER) >= 50 THEN 'yes' ELSE 'no' END AS big FROM people ORDER BY id`,
      assertions: expect([
        { name: "Ann", big: "no" }, { name: "Ben", big: "yes" }, { name: "Cara", big: "no" },
        { name: "Dan", big: "yes" }, { name: "Eve", big: "no" }, { name: "Finn", big: "yes" },
      ]),
      narrative: `Alongside the name, a CASE expression derives a "big" flag from the cast amount — a new column computed row by row.`,
      steps: [
        { do: "Keep the cleaned name", code: `trim(name) AS name` },
        { do: "Derive a flag from the amount", code: `CASE WHEN CAST(amount AS INTEGER) >= 50 THEN 'yes' ELSE 'no' END AS big` },
      ] },
    { id: "rename", task: "Select just name→who and amount(int)→spend (ordered by id).", why: "Projecting a smaller, better-named shape is routine — aliases rename columns.",
      focus: ["name", "amount"], solution: `SELECT trim(name) AS who, CAST(amount AS INTEGER) AS spend FROM people ORDER BY id`,
      assertions: expect([
        { who: "Ann", spend: 30 }, { who: "Ben", spend: 50 }, { who: "Cara", spend: 20 },
        { who: "Dan", spend: 70 }, { who: "Eve", spend: 0 }, { who: "Finn", spend: 50 },
      ]),
      narrative: `Select only the columns you want and use AS to rename them — a projection down to a cleaner two-column shape.`,
      steps: [
        { do: "Keep two columns, cleaned", code: `trim(name), CAST(amount AS INTEGER)` },
        { do: "Rename them", code: `AS who, AS spend` },
      ] },
  ],
};

// ── Pack 2: Explore (table reps) ───────────────────────────────────────────
const REPS_ROWS: DataRow[] = [
  { id: 1, rep: "Ann",  region: "EU",   deals: 4, revenue: 120 },
  { id: 2, rep: "Ben",  region: "NA",   deals: 7, revenue: 210 },
  { id: 3, rep: "Cara", region: "EU",   deals: 2, revenue: 60 },
  { id: 4, rep: "Dan",  region: "APAC", deals: 9, revenue: 270 },
  { id: 5, rep: "Eve",  region: "NA",   deals: 5, revenue: 150 },
  { id: 6, rep: "Finn", region: "EU",   deals: 6, revenue: 180 },
];

const SQL_EXPLORE: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Explore a dataset — the first-look profile (SQL)",
    role: "New `reps` table just landed. Size it up with SQL before any deep analysis.",
    goal: "Each cell is one profiling query on `reps` — extremes, mean, median, distinct counts, GROUP BY averages, ranking. Independent reps; write each from memory.",
    outcome: "That's a first-look profile in SQL — MIN/MAX, AVG, MEDIAN, COUNT DISTINCT, GROUP BY, ORDER BY. The reflex pass on any new table.",
    setupCode: sqlSetupFromRows(REPS_ROWS, "reps"),
    dataset: REPS_ROWS,
    tableName: "reps",
  },
  cells: [
    { id: "hi", task: "Select the largest revenue, as hi.", why: "MAX() — the top of the range, first thing you check.",
      focus: ["revenue"], solution: `SELECT max(revenue) AS hi FROM reps`, assertions: expect([{ hi: 270 }]),
      narrative: `max(revenue) scans every row and returns the single biggest revenue.`,
      steps: [{ do: "Take the biggest revenue", code: `max(revenue) AS hi` }, { do: "From reps", code: `FROM reps` }] },
    { id: "lo", task: "Select the smallest revenue, as lo.", why: "MIN() — the bottom of the range, the mirror of MAX.",
      focus: ["revenue"], solution: `SELECT min(revenue) AS lo FROM reps`, assertions: expect([{ lo: 60 }]),
      narrative: `min(revenue) returns the smallest value — together with the max it brackets the data.`,
      steps: [{ do: "Take the smallest revenue", code: `min(revenue) AS lo` }, { do: "From reps", code: `FROM reps` }] },
    { id: "spread", task: "Select the revenue range (max minus min), as spread.", why: "MAX − MIN — the quickest read on how spread out a column is.",
      focus: ["revenue"], solution: `SELECT max(revenue) - min(revenue) AS spread FROM reps`, assertions: expect([{ spread: 210 }]),
      narrative: `Subtracting the smallest revenue from the largest gives the range — one number for how wide the data reaches.`,
      steps: [{ do: "Subtract min from max", code: `max(revenue) - min(revenue)` }] },
    { id: "mean", task: "Select the average revenue rounded to 2dp, as mean_rev.", why: "AVG() — the centre of the data, rounded for a clean read.",
      focus: ["revenue"], solution: `SELECT round(avg(revenue), 2) AS mean_rev FROM reps`, assertions: expect([{ mean_rev: 165 }]),
      narrative: `avg(revenue) is the mean; round(..., 2) trims it to two decimals.`,
      steps: [{ do: "Average the revenue", code: `avg(revenue)` }, { do: "Round to 2dp", code: `round(…, 2)` }] },
    { id: "median", task: "Select the median revenue, as med.", why: "MEDIAN() — the middle value, robust to outliers where the mean isn't.",
      focus: ["revenue"], solution: `SELECT median(revenue) AS med FROM reps`, assertions: expect([{ med: 165 }]),
      narrative: `median(revenue) returns the middle of the sorted values (the mean of the two middle ones for an even count) — a DuckDB aggregate, no manual sorting.`,
      steps: [{ do: "Take the median revenue", code: `median(revenue) AS med` }] },
    { id: "top", task: "Select the rep with the highest revenue, as rep.", why: "ORDER BY … DESC LIMIT 1 — the top record, a constant move.",
      focus: ["rep", "revenue"], solution: `SELECT rep FROM reps ORDER BY revenue DESC LIMIT 1`, assertions: expect([{ rep: "Dan" }]),
      narrative: `Sorting by revenue descending puts the leader first; LIMIT 1 keeps just that row, and you select its rep.`,
      steps: [{ do: "Sort by revenue, highest first", code: `ORDER BY revenue DESC` }, { do: "Keep the top row", code: `LIMIT 1` }] },
    { id: "n_regions", task: "Count the distinct regions, as n_regions.", why: "COUNT(DISTINCT …) sizes a category in one call.",
      focus: ["region"], solution: `SELECT count(DISTINCT region) AS n_regions FROM reps`, assertions: expect([{ n_regions: 3 }]),
      narrative: `count(DISTINCT region) tallies how many different regions appear, dropping duplicates automatically.`,
      steps: [{ do: "Count the distinct regions", code: `count(DISTINCT region)` }] },
    { id: "share", task: "Select the top revenue as a fraction of total revenue, rounded to 4dp, as share.", why: "A share is a part over the whole — MAX over SUM.",
      focus: ["revenue"], solution: `SELECT round(max(revenue) * 1.0 / sum(revenue), 4) AS share FROM reps`, assertions: expect([{ share: 0.2727 }]),
      narrative: `The biggest revenue is the part, the sum is the whole; * 1.0 forces float division, and round trims it.`,
      steps: [{ do: "Biggest over total", code: `max(revenue) * 1.0 / sum(revenue)` }, { do: "Round to 4dp", code: `round(…, 4)` }] },
    { id: "above", task: "Count reps whose revenue beats the average, as above.", why: "A subquery computes the mean, then WHERE counts rows past it.",
      focus: ["revenue"], solution: `SELECT count(*) AS above FROM reps WHERE revenue > (SELECT avg(revenue) FROM reps)`, assertions: expect([{ above: 3 }]),
      narrative: `The subquery (SELECT avg(revenue) FROM reps) computes the mean; the outer WHERE keeps rows above it, and count(*) tallies them.`,
      steps: [{ do: "Compute the mean in a subquery", code: `(SELECT avg(revenue) FROM reps)` }, { do: "Count rows above it", code: `WHERE revenue > … ` }] },
    { id: "by_region", task: "Select each region's average revenue rounded to 1dp, as region and avg_rev (ordered by region).", why: "GROUP BY collapses rows per key — the core of exploration.",
      focus: ["region", "revenue"], solution: `SELECT region, round(avg(revenue), 1) AS avg_rev FROM reps GROUP BY region ORDER BY region`,
      assertions: expect([{ region: "APAC", avg_rev: 270 }, { region: "EU", avg_rev: 120 }, { region: "NA", avg_rev: 180 }]),
      narrative: `GROUP BY region makes one output row per region; avg(revenue) is computed within each group; ORDER BY region sorts the result.`,
      steps: [{ do: "Average within each region", code: `avg(revenue) … GROUP BY region` }, { do: "Order by region", code: `ORDER BY region` }] },
    { id: "ranked", task: "Select rep names ordered by revenue, highest first.", why: "ORDER BY … DESC builds a leaderboard.",
      focus: ["rep", "revenue"], solution: `SELECT rep FROM reps ORDER BY revenue DESC`,
      assertions: expect(["Dan","Ben","Finn","Eve","Ann","Cara"].map(rep => ({ rep }))),
      narrative: `Ordering by revenue descending ranks the reps; selecting rep returns just the names in that order.`,
      steps: [{ do: "Sort by revenue, highest first", code: `ORDER BY revenue DESC` }] },
  ],
};

// ── Pack 3: Build a chart (table traffic) ──────────────────────────────────
const TRAFFIC_ROWS: DataRow[] = [
  { id: 1, day: "Mon", visits: 12, source: "ad" },
  { id: 2, day: "Tue", visits: 18, source: "organic" },
  { id: 3, day: "Wed", visits: 9,  source: "ad" },
  { id: 4, day: "Thu", visits: 21, source: "organic" },
  { id: 5, day: "Fri", visits: 15, source: "ad" },
  { id: 6, day: "Sat", visits: 25, source: "organic" },
];

const SQL_CHART: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Build a chart — the data behind the visual (SQL)",
    role: "You're about to plot daily visits from `traffic`. Shape the numbers a chart needs, in SQL.",
    goal: "Each cell prepares one piece a chart needs from `traffic` — totals, percentages, a cumulative line, scaling, a histogram, a ranking — largely with window functions. Independent reps.",
    outcome: "That's a chart's worth of prep in SQL — GROUP BY totals, SUM/AVG/MAX OVER (), bucketing, RANK. Feed any of it to a plot.",
    setupCode: sqlSetupFromRows(TRAFFIC_ROWS, "traffic"),
    dataset: TRAFFIC_ROWS,
    tableName: "traffic",
  },
  cells: [
    { id: "labels", task: "Select the day of each row (ordered by id).", why: "The category axis is just one column, in order.",
      focus: ["day"], solution: `SELECT day FROM traffic ORDER BY id`,
      assertions: expect(["Mon","Tue","Wed","Thu","Fri","Sat"].map(day => ({ day }))),
      narrative: `Selecting day in id order gives the x-axis labels that sit under each bar.`,
      steps: [{ do: "Select the day column", code: `SELECT day` }, { do: "In order", code: `ORDER BY id` }] },
    { id: "heights", task: "Select the visits of each row (ordered by id).", why: "The y-values — the other half of a bar chart.",
      focus: ["visits"], solution: `SELECT visits FROM traffic ORDER BY id`,
      assertions: expect([12,18,9,21,15,25].map(visits => ({ visits }))),
      narrative: `visits in id order is the height series, paired with the day labels.`,
      steps: [{ do: "Select the visits column", code: `SELECT visits` }, { do: "In order", code: `ORDER BY id` }] },
    { id: "by_source", task: "Select total visits per source, as source and visits (ordered by source).", why: "Grouped/stacked charts start from GROUP BY totals.",
      focus: ["source", "visits"], solution: `SELECT source, sum(visits) AS visits FROM traffic GROUP BY source ORDER BY source`,
      assertions: expect([{ source: "ad", visits: 36 }, { source: "organic", visits: 64 }]),
      narrative: `GROUP BY source makes one row per source; sum(visits) totals within each — the bars of a grouped chart.`,
      steps: [{ do: "Total visits within each source", code: `sum(visits) … GROUP BY source` }] },
    { id: "pct", task: "Select each day and its visits as a percentage of the total, rounded to 1dp, as pct (ordered by id).", why: "A window SUM() OVER () gives the grand total on every row — no subquery.",
      focus: ["day", "visits"], solution: `SELECT day, round(visits * 100.0 / sum(visits) OVER (), 1) AS pct FROM traffic ORDER BY id`,
      assertions: expect([
        { day: "Mon", pct: 12 }, { day: "Tue", pct: 18 }, { day: "Wed", pct: 9 },
        { day: "Thu", pct: 21 }, { day: "Fri", pct: 15 }, { day: "Sat", pct: 25 },
      ]),
      narrative: `sum(visits) OVER () is the grand total attached to every row; dividing each day's visits by it (times 100) gives the percentage.`,
      steps: [{ do: "Total across all rows via a window", code: `sum(visits) OVER ()` }, { do: "Each day's share, as a percent", code: `visits * 100.0 / …` }] },
    { id: "cum", task: "Select each day and the running total of visits, as day and cum (ordered by id).", why: "SUM() OVER (ORDER BY …) is the cumulative line, no loop.",
      focus: ["day", "visits"], solution: `SELECT day, sum(visits) OVER (ORDER BY id) AS cum FROM traffic ORDER BY id`,
      assertions: expect([
        { day: "Mon", cum: 12 }, { day: "Tue", cum: 30 }, { day: "Wed", cum: 39 },
        { day: "Thu", cum: 60 }, { day: "Fri", cum: 75 }, { day: "Sat", cum: 100 },
      ]),
      narrative: `Adding ORDER BY id inside the window makes SUM accumulate row by row, giving a running total that climbs to the grand sum.`,
      steps: [{ do: "Running total via an ordered window", code: `sum(visits) OVER (ORDER BY id)` }] },
    { id: "scaled", task: "Select each day and its visits divided by the max (2dp), as day and scaled (ordered by id).", why: "Dividing by MAX() OVER () normalises to 0–1 for a shared axis.",
      focus: ["day", "visits"], solution: `SELECT day, round(visits * 1.0 / max(visits) OVER (), 2) AS scaled FROM traffic ORDER BY id`,
      assertions: expect([
        { day: "Mon", scaled: 0.48 }, { day: "Tue", scaled: 0.72 }, { day: "Wed", scaled: 0.36 },
        { day: "Thu", scaled: 0.84 }, { day: "Fri", scaled: 0.6 }, { day: "Sat", scaled: 1 },
      ]),
      narrative: `max(visits) OVER () is the largest value on every row; dividing squeezes the series into 0–1, with the tallest becoming 1.0.`,
      steps: [{ do: "Max across all rows via a window", code: `max(visits) OVER ()` }, { do: "Divide to normalise", code: `visits * 1.0 / …` }] },
    { id: "hist", task: "Select a histogram: bucket visits into tens, as bucket and n (ordered by bucket).", why: "Binning + COUNT is the whole idea behind a histogram.",
      focus: ["visits"], solution: `SELECT CAST(floor(visits / 10) AS INTEGER) * 10 AS bucket, count(*) AS n FROM traffic GROUP BY bucket ORDER BY bucket`,
      assertions: expect([{ bucket: 0, n: 1 }, { bucket: 10, n: 3 }, { bucket: 20, n: 2 }]),
      narrative: `floor(visits / 10) * 10 snaps each value down to its bucket (0, 10, 20…); GROUP BY bucket + count(*) tallies how many land in each.`,
      steps: [{ do: "Snap each value to its bucket", code: `floor(visits / 10) * 10 AS bucket` }, { do: "Count per bucket", code: `count(*) … GROUP BY bucket` }] },
    { id: "rank", task: "Select each day and its rank by visits (busiest = 1), as day and rnk (ordered by rnk).", why: "RANK() OVER (ORDER BY …) numbers rows by a measure.",
      focus: ["day", "visits"], solution: `SELECT day, rank() OVER (ORDER BY visits DESC) AS rnk FROM traffic ORDER BY rnk`,
      assertions: expect([
        { day: "Sat", rnk: 1 }, { day: "Thu", rnk: 2 }, { day: "Tue", rnk: 3 },
        { day: "Fri", rnk: 4 }, { day: "Mon", rnk: 5 }, { day: "Wed", rnk: 6 },
      ]),
      narrative: `rank() OVER (ORDER BY visits DESC) assigns 1 to the busiest day, 2 to the next, and so on — a ranking column for a sorted chart.`,
      steps: [{ do: "Rank rows by visits, busiest first", code: `rank() OVER (ORDER BY visits DESC)` }] },
    { id: "peak", task: "Select the day with the most visits, as day.", why: "Charts often annotate the high point.",
      focus: ["day", "visits"], solution: `SELECT day FROM traffic ORDER BY visits DESC LIMIT 1`, assertions: expect([{ day: "Sat" }]),
      narrative: `Order by visits descending and LIMIT 1 to pick the single busiest day — the annotation point.`,
      steps: [{ do: "Sort by visits, highest first", code: `ORDER BY visits DESC` }, { do: "Keep the top", code: `LIMIT 1` }] },
    { id: "ranked", task: "Select the days ordered by visits, busiest first.", why: "A sorted bar chart reads best.",
      focus: ["day", "visits"], solution: `SELECT day FROM traffic ORDER BY visits DESC`,
      assertions: expect(["Sat","Thu","Tue","Fri","Mon","Wed"].map(day => ({ day }))),
      narrative: `Ordering by visits descending returns the days from busiest to quietest — the order to draw a ranked bar chart.`,
      steps: [{ do: "Sort by visits, busiest first", code: `ORDER BY visits DESC` }] },
  ],
};

// ── Pack 4: Linear regression via built-ins (table points) ─────────────────
const POINTS_ROWS: DataRow[] = [
  { id: 1, x: 1, y: 2 }, { id: 2, x: 2, y: 4 }, { id: 3, x: 3, y: 5 },
  { id: 4, x: 4, y: 4 }, { id: 5, x: 5, y: 5 },
];

const SQL_REGRESSION: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Linear regression — the SQL way (DuckDB built-ins)",
    role: "Five (x, y) points in `points`. DuckDB fits the least-squares line for you with regr_* aggregates.",
    goal: "Each cell is one aggregate over `points` — means, then DuckDB's regr_slope / regr_intercept / regr_r2 / corr, then a prediction. This is how regression is actually done in analytics SQL, not from scratch.",
    outcome: "DuckDB fit the line for you: slope 0.6, intercept 2.2, R² 0.6. The regr_* aggregates are the idiomatic SQL way.",
    setupCode: sqlSetupFromRows(POINTS_ROWS, "points"),
    dataset: POINTS_ROWS,
    tableName: "points",
  },
  cells: [
    { id: "mx", task: "Select the mean of x, as mx.", why: "AVG(x) — the x-centre.",
      focus: ["x"], solution: `SELECT avg(x) AS mx FROM points`, assertions: expect([{ mx: 3 }]),
      narrative: `avg(x) is the mean of the predictor.`,
      steps: [{ do: "Average x", code: `avg(x) AS mx` }] },
    { id: "my", task: "Select the mean of y, as my.", why: "AVG(y) — the y-centre.",
      focus: ["y"], solution: `SELECT avg(y) AS my FROM points`, assertions: expect([{ my: 4 }]),
      narrative: `avg(y) is the mean of the response.`,
      steps: [{ do: "Average y", code: `avg(y) AS my` }] },
    { id: "slope", task: "Select the least-squares slope of y on x, rounded to 2dp, as slope.", why: "regr_slope(y, x) is DuckDB's built-in slope — note dependent (y) comes first.",
      focus: ["x", "y"], solution: `SELECT round(regr_slope(y, x), 2) AS slope FROM points`, assertions: expect([{ slope: 0.6 }]),
      narrative: `regr_slope(y, x) computes covariance over variance internally — the fitted slope. The dependent variable y is the first argument.`,
      steps: [{ do: "DuckDB's slope aggregate", code: `regr_slope(y, x)` }, { do: "Round to 2dp", code: `round(…, 2)` }] },
    { id: "intercept", task: "Select the regression intercept, rounded to 2dp, as intercept.", why: "regr_intercept(y, x) — where the fitted line crosses.",
      focus: ["x", "y"], solution: `SELECT round(regr_intercept(y, x), 2) AS intercept FROM points`, assertions: expect([{ intercept: 2.2 }]),
      narrative: `regr_intercept(y, x) returns the line's intercept — the value of y where x is zero on the fitted line.`,
      steps: [{ do: "DuckDB's intercept aggregate", code: `regr_intercept(y, x)` }] },
    { id: "r2", task: "Select the R² of the fit, rounded to 2dp, as r2.", why: "regr_r2(y, x) — the share of variance the line explains.",
      focus: ["x", "y"], solution: `SELECT round(regr_r2(y, x), 2) AS r2 FROM points`, assertions: expect([{ r2: 0.6 }]),
      narrative: `regr_r2(y, x) reports how much of y's variance the line accounts for — the standard goodness-of-fit score.`,
      steps: [{ do: "DuckDB's R² aggregate", code: `regr_r2(y, x)` }] },
    { id: "corr", task: "Select the correlation between x and y, rounded to 4dp, as corr.", why: "CORR(y, x) — the strength and direction of the linear relationship.",
      focus: ["x", "y"], solution: `SELECT round(corr(y, x), 4) AS corr FROM points`, assertions: expect([{ corr: 0.7746 }]),
      narrative: `corr(y, x) is Pearson's correlation; for a simple regression it's the square root of R².`,
      steps: [{ do: "DuckDB's correlation aggregate", code: `corr(y, x)` }] },
    { id: "pred", task: "Predict y at x = 6 from the fitted line, rounded to 2dp, as pred.", why: "Combine the built-in slope and intercept to extrapolate.",
      focus: ["x", "y"], solution: `SELECT round(regr_slope(y, x) * 6 + regr_intercept(y, x), 2) AS pred FROM points`, assertions: expect([{ pred: 5.8 }]),
      narrative: `The model is slope·x + intercept; plugging in x = 6 with the two regr_* aggregates predicts y one step past the data.`,
      steps: [{ do: "Apply the fitted line at x = 6", code: `regr_slope(y, x) * 6 + regr_intercept(y, x)` }] },
  ],
};

// ── Pack 5: Forecasting via windows (table months) ─────────────────────────
const MONTHS_ROWS: DataRow[] = [
  { id: 1, month: "Jan", sales: 100 }, { id: 2, month: "Feb", sales: 120 },
  { id: 3, month: "Mar", sales: 140 }, { id: 4, month: "Apr", sales: 130 },
  { id: 5, month: "May", sales: 160 }, { id: 6, month: "Jun", sales: 180 },
];

const SQL_FORECASTING: DrillContent = {
  lang: "sql",
  cumulative: false,
  scenario: {
    title: "Forecasting — reading a series with window functions (SQL)",
    role: "Six months of sales in `months`, trending up. Measure the trend with SQL window functions.",
    goal: "Each cell is one time-series move on `months` — LAG differences, growth, a moving average, a cumulative — the window-function toolkit. Independent reps.",
    outcome: "That's the SQL time-series kit — LAG for change, AVG OVER a moving window, SUM OVER for cumulative. The backbone of trend analysis in SQL.",
    setupCode: sqlSetupFromRows(MONTHS_ROWS, "months"),
    dataset: MONTHS_ROWS,
    tableName: "months",
  },
  cells: [
    { id: "series", task: "Select the sales in order (by id).", why: "The bare value sequence — the start of any time-series work.",
      focus: ["sales"], solution: `SELECT sales FROM months ORDER BY id`,
      assertions: expect([100,120,140,130,160,180].map(sales => ({ sales }))),
      narrative: `Selecting sales in id order gives the ordered series to analyse.`,
      steps: [{ do: "Select sales in time order", code: `SELECT sales … ORDER BY id` }] },
    { id: "diffs", task: "Select each month and its change from the previous month, as month and diff (ordered by id).", why: "LAG() reaches back one row — the previous value — so you can subtract.",
      focus: ["month", "sales"], solution: `SELECT month, sales - lag(sales) OVER (ORDER BY id) AS diff FROM months ORDER BY id`,
      assertions: expect([
        { month: "Jan", diff: null }, { month: "Feb", diff: 20 }, { month: "Mar", diff: 20 },
        { month: "Apr", diff: -10 }, { month: "May", diff: 30 }, { month: "Jun", diff: 20 },
      ]),
      narrative: `lag(sales) OVER (ORDER BY id) is the previous month's sales; subtracting gives the month-over-month change. The first row has no previous, so its diff is NULL.`,
      steps: [{ do: "Look back one month", code: `lag(sales) OVER (ORDER BY id)` }, { do: "Subtract to get the change", code: `sales - …` }] },
    { id: "growth", task: "Select each month and its percentage change from the previous, to 1dp, as month and growth (ordered by id).", why: "Growth normalises the change by the previous level.",
      focus: ["month", "sales"], solution: `SELECT month, round((sales - lag(sales) OVER (ORDER BY id)) * 100.0 / lag(sales) OVER (ORDER BY id), 1) AS growth FROM months ORDER BY id`,
      assertions: expect([
        { month: "Jan", growth: null }, { month: "Feb", growth: 20 }, { month: "Mar", growth: 16.7 },
        { month: "Apr", growth: -7.1 }, { month: "May", growth: 23.1 }, { month: "Jun", growth: 12.5 },
      ]),
      narrative: `The change (sales − lag) divided by the previous value (lag), times 100, is the growth rate — again NULL for the first month.`,
      steps: [{ do: "Change over the previous value", code: `(sales - lag(…)) / lag(…)` }, { do: "As a rounded percent", code: `* 100.0, round(…, 1)` }] },
    { id: "ma3", task: "Select each month and its 3-month moving average (2dp), as month and ma3 (ordered by id).", why: "AVG OVER a sliding frame smooths the wobble to show the trend.",
      focus: ["month", "sales"], solution: `SELECT month, round(avg(sales) OVER (ORDER BY id ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS ma3 FROM months ORDER BY id`,
      assertions: expect([
        { month: "Jan", ma3: 100 }, { month: "Feb", ma3: 110 }, { month: "Mar", ma3: 120 },
        { month: "Apr", ma3: 130 }, { month: "May", ma3: 143.33 }, { month: "Jun", ma3: 156.67 },
      ]),
      narrative: `The frame ROWS BETWEEN 2 PRECEDING AND CURRENT ROW is a sliding window of up to three months; avg(sales) over it is the moving average (partial at the start).`,
      steps: [{ do: "Define a sliding 3-row frame", code: `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` }, { do: "Average within the frame", code: `avg(sales) OVER (…)` }] },
    { id: "cum", task: "Select each month and the year-to-date total, as month and cum (ordered by id).", why: "SUM OVER an ordered window is the running total.",
      focus: ["month", "sales"], solution: `SELECT month, sum(sales) OVER (ORDER BY id) AS cum FROM months ORDER BY id`,
      assertions: expect([
        { month: "Jan", cum: 100 }, { month: "Feb", cum: 220 }, { month: "Mar", cum: 360 },
        { month: "Apr", cum: 490 }, { month: "May", cum: 650 }, { month: "Jun", cum: 830 },
      ]),
      narrative: `sum(sales) OVER (ORDER BY id) accumulates month by month, giving the year-to-date total that climbs to the full-year sum.`,
      steps: [{ do: "Running total via an ordered window", code: `sum(sales) OVER (ORDER BY id)` }] },
    { id: "naive", task: "Select the naive next-month forecast — the last month's sales — as naive.", why: "The baseline forecast: next equals the most recent value.",
      focus: ["sales"], solution: `SELECT sales AS naive FROM months ORDER BY id DESC LIMIT 1`, assertions: expect([{ naive: 180 }]),
      narrative: `Ordering by id descending puts the latest month first; LIMIT 1 takes its sales — the naive forecast for next month.`,
      steps: [{ do: "Latest month first", code: `ORDER BY id DESC` }, { do: "Take its sales", code: `LIMIT 1` }] },
    { id: "peak", task: "Select the month with the highest sales, as month.", why: "Spotting the peak period is a routine read.",
      focus: ["month", "sales"], solution: `SELECT month FROM months ORDER BY sales DESC LIMIT 1`, assertions: expect([{ month: "Jun" }]),
      narrative: `Order by sales descending and LIMIT 1 to name the month the series topped out.`,
      steps: [{ do: "Sort by sales, highest first", code: `ORDER BY sales DESC` }, { do: "Keep the top", code: `LIMIT 1` }] },
  ],
};

export const SQL_PACKS: DrillPack[] = [
  { id: "sql-clean-shape",      title: "Clean & shape data",  blurb: "Tidy a messy table in SQL — TRIM, LOWER, CAST, WHERE, DISTINCT, CASE.", tag: "SQL", lang: "sql", content: SQL_CLEAN },
  { id: "sql-explore",         title: "Explore a dataset",    blurb: "Profile a table — MIN/MAX, AVG, MEDIAN, COUNT DISTINCT, GROUP BY.",     tag: "SQL", lang: "sql", content: SQL_EXPLORE },
  { id: "sql-build-chart",     title: "Build a chart",        blurb: "Chart-data prep with window functions — totals, %, cumulative, rank.",   tag: "SQL", lang: "sql", content: SQL_CHART },
  { id: "sql-linear-regression", title: "Linear regression",  blurb: "The SQL way — DuckDB's regr_slope / regr_intercept / regr_r2 built-ins.", tag: "SQL", lang: "sql", content: SQL_REGRESSION },
  { id: "sql-forecasting",     title: "Forecasting",          blurb: "Time-series with window functions — LAG diffs, moving average, cumulative.", tag: "SQL", lang: "sql", content: SQL_FORECASTING },
];
