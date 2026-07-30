// Curated practice packs — the primary Code-pillar content.
//
// A pack is a set of BITE-SIZE, INDEPENDENT reps: each cell is one small,
// standard construct written from memory against a shared dataset. The point is
// fluency through repetition, not solving a novel problem — so cells usually
// don't build on each other (`cumulative: false`). Add packs by adding entries.
//
// The Python data-analysis packs are authored in **pandas** (`dataKind:
// "dataframe"`) — the tool analysts actually reach for — so `df` is a real
// pandas DataFrame loaded into the Pyodide worker on demand. Packs about
// scripting/orchestration/retrieval rather than tabular analysis (automation,
// airflow, rag) use plain `dataKind: "rows"` instead — pandas doesn't fit
// what they're teaching. The SQL packs (DuckDB) live in sqlPacks.ts. The
// dataset-less Python-fundamentals warm-up ("Let's Do This!", 9 parts) lives
// in letsDoThisPacks.ts and is prepended to PACKS below.

import { pdDataFrameLiteral, type DataRow, type DrillContent } from "./drillContent";
import type { DrillLang } from "@/types/code";
import { SQL_PACKS } from "./sqlPacks";
import { AUTOMATION_PACKS } from "./automationPacks";
import { AIRFLOW_PACKS } from "./airflowPacks";
import { RAG_PACKS } from "./ragPacks";
import { ML_PACKS } from "./mlPacks";
import { LOOP_PACKS } from "./loopPacks";
import { LETS_DO_THIS_PACKS } from "./letsDoThisPacks";

export interface DrillPack {
  id: string;        // URL slug: /code/drill?pack=<id>
  title: string;     // card title
  blurb: string;     // one-line card description
  tag: string;       // small pill, e.g. "pandas"
  lang: DrillLang;   // which language pill this pack lives under
  content: DrillContent;
}

// ── Pack 2: Clean & shape data ─────────────────────────────────────────────
const CLEAN_ROWS: DataRow[] = [
  { name: " Ann ", city: "london", amount: "30", status: "active" },
  { name: "Ben",   city: "LONDON", amount: "50", status: "active" },
  { name: "Cara ", city: "Paris",  amount: "20", status: "ACTIVE" },
  { name: "Dan",   city: "paris",  amount: "70", status: "inactive" },
  { name: " Eve",  city: "London", amount: "0",  status: "active" },
  { name: "Finn",  city: "paris",  amount: "50", status: "Inactive" },
];

const CLEAN_SHAPE: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  scenario: {
    title: "Clean & shape data — tidy a messy DataFrame",
    role: "The data came in dirty: stray spaces, inconsistent case, numbers stored as text. Whip `df` into shape with pandas.",
    goal: "Each cell is one standard cleaning move on the same messy `df` — .str methods, .astype, masks, .assign. Independent reps; write each from memory.",
    outcome: "That's the pandas tidy-up toolkit — strip, lowercase, cast, filter, dedupe, derive, rename. Real cleaning is these moves, stacked.",
    setupCode: pdDataFrameLiteral(CLEAN_ROWS),
    dataset: CLEAN_ROWS,
  },
  cells: [
    { id: "trimmed", task: "Create trimmed — the name column with surrounding spaces removed.", why: ".str.strip() applies a string method down a whole column at once.",
      focus: ["name"], solution: `trimmed = df["name"].str.strip()`, assertions: `assert list(trimmed) == ["Ann", "Ben", "Cara", "Dan", "Eve", "Finn"]`,
      narrative: `The .str accessor runs a string method on every value in the column. df["name"].str.strip() trims all six names in one vectorised call.`,
      steps: [
        { do: "Reach into the name column's strings", code: `df["name"].str` },
        { do: "Strip each one", code: `.strip()` },
      ] },
    { id: "cities", task: "Create cities — the city column, lowercased.", why: ".str.lower() normalises case across the column so values stop splitting.",
      focus: ["city"], solution: `cities = df["city"].str.lower()`, assertions: `assert list(cities) == ["london", "london", "paris", "paris", "london", "paris"]`,
      narrative: `df["city"].str.lower() lowercases every city at once, collapsing "London" and "LONDON" to one canonical value.`,
      steps: [
        { do: "Reach into the city strings", code: `df["city"].str` },
        { do: "Lowercase each", code: `.lower()` },
      ] },
    { id: "amounts", task: "Create amounts — the amount column converted to integers.", why: ".astype(int) casts a whole column's type — text to numbers.",
      focus: ["amount"], solution: `amounts = df["amount"].astype(int)`, assertions: `assert list(amounts) == [30, 50, 20, 70, 0, 50]`,
      narrative: `The amounts are strings. df["amount"].astype(int) converts the entire column to integers, so it can be summed or compared.`,
      steps: [
        { do: "Select the amount column", code: `df["amount"]` },
        { do: "Cast it to integers", code: `.astype(int)` },
      ] },
    { id: "total", task: "Create total — the sum of amount, converted to int.", why: "Cast, then aggregate: chain .astype(int).sum() on the column.",
      focus: ["amount"], solution: `total = df["amount"].astype(int).sum()`, assertions: `assert total == 220`,
      narrative: `df["amount"].astype(int) turns the text column numeric, and .sum() totals it — cleaning and aggregating chained on one line.`,
      steps: [
        { do: "Cast the amounts to int", code: `df["amount"].astype(int)` },
        { do: "Sum them", code: `.sum()` },
      ] },
    { id: "nonzero", task: "Create nonzero — only the rows whose amount is above zero.", why: "Mask on a cast column — filter after converting the type.",
      focus: ["amount"], solution: `nonzero = df[df["amount"].astype(int) > 0]`, assertions: `assert len(nonzero) == 5`,
      narrative: `df["amount"].astype(int) > 0 builds a boolean mask on the converted amounts; df[...] keeps the rows that clear zero, dropping the empty record.`,
      steps: [
        { do: "Mask amounts above zero", code: `df["amount"].astype(int) > 0` },
        { do: "Select those rows", code: `df[ ... ]` },
      ] },
    { id: "cities_uniq", task: "Create cities_uniq — the distinct cities, normalised and sorted.", why: "Normalise, then .unique(); sort the result so casing doesn't split them.",
      focus: ["city"], solution: `cities_uniq = sorted(df["city"].str.lower().unique())`, assertions: `assert list(cities_uniq) == ["london", "paris"]`,
      narrative: `Lowercasing first means the variants collapse; .unique() drops duplicates; sorted() orders them — normalise, dedupe, sort.`,
      steps: [
        { do: "Lowercase the cities", code: `df["city"].str.lower()` },
        { do: "Distinct, then sorted", code: `.unique()` },
      ] },
    { id: "active", task: `Create active — a True/False column: is the status "active"?`, why: "Chain .str methods then compare — a normalised boolean column.",
      focus: ["status"], solution: `active = df["status"].str.strip().str.lower() == "active"`, assertions: `assert list(active) == [True, True, True, False, True, False]`,
      narrative: `.str.strip().str.lower() flattens the inconsistent status text, and == "active" turns the whole column into clean True/False in one vectorised comparison.`,
      steps: [
        { do: "Normalise the status text", code: `df["status"].str.strip().str.lower()` },
        { do: "Compare to \"active\"", code: `== "active"` },
      ] },
    { id: "clean", task: "Create clean — a new DataFrame: name stripped, city lowered, amount as int.", why: "Build a fresh DataFrame from cleaned columns — the core reshape.",
      focus: ["name", "city", "amount"], solution: `clean = pd.DataFrame({"name": df["name"].str.strip(), "city": df["city"].str.lower(), "amount": df["amount"].astype(int)})`, assertions: `assert list(clean["name"]) == ["Ann", "Ben", "Cara", "Dan", "Eve", "Finn"] and list(clean["amount"]) == [30, 50, 20, 70, 0, 50]`,
      narrative: `pd.DataFrame({...}) assembles a new frame from named columns — each one a cleaned version of the original — giving a fully tidy table in a single expression.`,
      steps: [
        { do: "Clean each column", code: `df["name"].str.strip(), df["city"].str.lower(), df["amount"].astype(int)` },
        { do: "Assemble into a DataFrame", code: `pd.DataFrame({ ... })` },
      ] },
    { id: "flagged", task: `Create flagged — df plus a "big" column: "yes" if amount ≥ 50, else "no".`, why: ".assign adds a derived column; .map turns a boolean into labels.",
      focus: ["amount"], solution: `flagged = df.assign(big=df["amount"].astype(int).ge(50).map({True: "yes", False: "no"}))`, assertions: `assert list(flagged["big"]) == ["no", "yes", "no", "yes", "no", "yes"]`,
      narrative: `df.assign(big=...) returns a copy with a new column. Inside, .ge(50) makes a boolean Series and .map({True:"yes", False:"no"}) relabels it — a derived column in one line.`,
      steps: [
        { do: "Test amount ≥ 50", code: `df["amount"].astype(int).ge(50)` },
        { do: "Map True/False to yes/no", code: `.map({True: "yes", False: "no"})` },
        { do: "Add it as a new column", code: `df.assign(big= ... )` },
      ] },
    { id: "titled", task: "Create titled — the names trimmed and title-cased.", why: "Chain .str methods — strip then title — down the column.",
      focus: ["name"], solution: `titled = df["name"].str.strip().str.title()`, assertions: `assert list(titled) == ["Ann", "Ben", "Cara", "Dan", "Eve", "Finn"]`,
      narrative: `.str methods chain: .str.strip() removes the spaces and .str.title() capitalises each name — two cleanups in one pass over the column.`,
      steps: [
        { do: "Strip the names", code: `df["name"].str.strip()` },
        { do: "Title-case them", code: `.str.title()` },
      ] },
    { id: "slim", task: `Create slim — a DataFrame keeping only name (as "who") and amount (as "spend").`, why: "Project to a smaller, renamed shape by building a new DataFrame.",
      focus: ["name", "amount"], solution: `slim = pd.DataFrame({"who": df["name"].str.strip(), "spend": df["amount"].astype(int)})`, assertions: `assert list(slim.columns) == ["who", "spend"] and list(slim["spend"]) == [30, 50, 20, 70, 0, 50]`,
      narrative: `Assemble a new frame with just the columns you want, under new names — "who" and "spend" — cleaning them on the way in.`,
      steps: [
        { do: "Pick two cleaned columns", code: `df["name"].str.strip(), df["amount"].astype(int)` },
        { do: "Name them in a new DataFrame", code: `pd.DataFrame({"who": ..., "spend": ...})` },
      ] },
  ],
};

// ── Pack 3: Explore a dataset ──────────────────────────────────────────────
const EXPLORE_ROWS: DataRow[] = [
  { rep: "Ann",  region: "EU",   deals: 4, revenue: 120 },
  { rep: "Ben",  region: "NA",   deals: 7, revenue: 210 },
  { rep: "Cara", region: "EU",   deals: 2, revenue: 60 },
  { rep: "Dan",  region: "APAC", deals: 9, revenue: 270 },
  { rep: "Eve",  region: "NA",   deals: 5, revenue: 150 },
  { rep: "Finn", region: "EU",   deals: 6, revenue: 180 },
];

const EXPLORE_DATA: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  scenario: {
    title: "Explore a dataset — the first-look profile",
    role: "New DataFrame just landed. Before any deep analysis, size it up with pandas: how big, how spread, who leads.",
    goal: "Each cell is one profiling move on the same `df` — extremes, mean, median, distinct counts, groupby averages, ranking. Independent reps; write each from memory.",
    outcome: "That's a first-look profile in pandas — min/max, mean, median, nunique, groupby, sort. The reflex pass on any DataFrame.",
    setupCode: pdDataFrameLiteral(EXPLORE_ROWS),
    dataset: EXPLORE_ROWS,
  },
  cells: [
    { id: "hi", task: "Create hi — the largest revenue.", why: ".max() on the column — top of the range.",
      focus: ["revenue"], solution: `hi = df["revenue"].max()`, assertions: `assert hi == 270`,
      narrative: `df["revenue"].max() returns the biggest value in the column — the first thing you check on a new number field.`,
      steps: [{ do: "Select revenue", code: `df["revenue"]` }, { do: "Take the max", code: `.max()` }] },
    { id: "lo", task: "Create lo — the smallest revenue.", why: ".min() — the mirror of max.",
      focus: ["revenue"], solution: `lo = df["revenue"].min()`, assertions: `assert lo == 60`,
      narrative: `df["revenue"].min() returns the smallest value — together with the max it brackets the data.`,
      steps: [{ do: "Select revenue", code: `df["revenue"]` }, { do: "Take the min", code: `.min()` }] },
    { id: "spread", task: "Create spread — the revenue range (max minus min).", why: "Compose two aggregates — the quickest read on spread.",
      focus: ["revenue"], solution: `spread = df["revenue"].max() - df["revenue"].min()`, assertions: `assert spread == 210`,
      narrative: `Subtracting the column's min from its max gives the range — one number for how wide the data reaches.`,
      steps: [{ do: "Max of revenue", code: `df["revenue"].max()` }, { do: "Minus the min", code: `- df["revenue"].min()` }] },
    { id: "mean_rev", task: "Create mean_rev — the average revenue.", why: ".mean() — the centre of the column.",
      focus: ["revenue"], solution: `mean_rev = df["revenue"].mean()`, assertions: `assert mean_rev == 165`,
      narrative: `df["revenue"].mean() is the balance point of the column — total over count, computed for you.`,
      steps: [{ do: "Select revenue", code: `df["revenue"]` }, { do: "Take the mean", code: `.mean()` }] },
    { id: "med", task: "Create med — the median revenue.", why: ".median() resists outliers where the mean doesn't.",
      focus: ["revenue"], solution: `med = df["revenue"].median()`, assertions: `assert med == 165`,
      narrative: `df["revenue"].median() returns the middle value once sorted (the mean of the two middles for an even count) — robust to a stray large number.`,
      steps: [{ do: "Select revenue", code: `df["revenue"]` }, { do: "Take the median", code: `.median()` }] },
    { id: "top", task: "Create top — the name of the rep with the highest revenue.", why: "idxmax gives the top row's label; .loc reads a cell off it.",
      focus: ["rep", "revenue"], solution: `top = df.loc[df["revenue"].idxmax(), "rep"]`, assertions: `assert top == "Dan"`,
      narrative: `df["revenue"].idxmax() finds the label of the top-revenue row; df.loc[label, "rep"] reads that row's rep — who leads, not just the number.`,
      steps: [
        { do: "Find the top row's label", code: `df["revenue"].idxmax()` },
        { do: "Read its rep", code: `df.loc[ ... , "rep"]` },
      ] },
    { id: "n_regions", task: "Create n_regions — how many distinct regions appear.", why: ".nunique() counts distinct values in a column.",
      focus: ["region"], solution: `n_regions = df["region"].nunique()`, assertions: `assert n_regions == 3`,
      narrative: `df["region"].nunique() counts the different regions in one call — pandas' answer to "how many categories?".`,
      steps: [{ do: "Select region", code: `df["region"]` }, { do: "Count distinct", code: `.nunique()` }] },
    { id: "share", task: "Create share — the top revenue as a fraction of total revenue.", why: "A share is a part over the whole — compose max and sum.",
      focus: ["revenue"], solution: `share = df["revenue"].max() / df["revenue"].sum()`, assertions: `assert round(share, 4) == 0.2727`,
      narrative: `The biggest revenue is the part, the column's sum is the whole; dividing gives the fraction the leader accounts for.`,
      steps: [{ do: "Biggest revenue (the part)", code: `df["revenue"].max()` }, { do: "Over the total (the whole)", code: `/ df["revenue"].sum()` }] },
    { id: "above", task: "Create above — how many reps beat the average revenue.", why: "Compare a column to its own mean, then .sum() the boolean mask to count.",
      focus: ["revenue"], solution: `above = (df["revenue"] > df["revenue"].mean()).sum()`, assertions: `assert above == 3`,
      narrative: `df["revenue"] > df["revenue"].mean() makes a boolean Series (True where a rep beats the mean); summing booleans counts the Trues — a count-with-a-condition.`,
      steps: [
        { do: "Mask rows above the mean", code: `df["revenue"] > df["revenue"].mean()` },
        { do: "Sum the True values", code: `.sum()` },
      ] },
    { id: "by_region_avg", task: "Create by_region_avg — each region's average revenue.", why: "groupby then .mean() — split by key, average each group.",
      focus: ["region", "revenue"], solution: `by_region_avg = df.groupby("region")["revenue"].mean()`, assertions: `assert by_region_avg.to_dict() == {"APAC": 270, "EU": 120, "NA": 180}`,
      narrative: `df.groupby("region") splits the rows by region; ["revenue"].mean() averages within each — the grouped comparison in one line.`,
      steps: [
        { do: "Split into groups by region", code: `df.groupby("region")` },
        { do: "Average revenue in each", code: `["revenue"].mean()` },
      ] },
    { id: "ranked", task: "Create ranked — the rep names ordered by revenue, highest first.", why: "sort_values orders the frame; then project the name column.",
      focus: ["rep", "revenue"], solution: `ranked = df.sort_values("revenue", ascending=False)["rep"]`, assertions: `assert list(ranked) == ["Dan", "Ben", "Finn", "Eve", "Ann", "Cara"]`,
      narrative: `df.sort_values("revenue", ascending=False) reorders the rows highest-first, and ["rep"] pulls just the names in that order — a leaderboard.`,
      steps: [
        { do: "Sort by revenue, highest first", code: `df.sort_values("revenue", ascending=False)` },
        { do: "Take the rep column", code: `["rep"]` },
      ] },
  ],
};

// ── Pack 4: Build a chart ──────────────────────────────────────────────────
const CHART_ROWS: DataRow[] = [
  { day: "Mon", visits: 12, source: "ad" },
  { day: "Tue", visits: 18, source: "organic" },
  { day: "Wed", visits: 9,  source: "ad" },
  { day: "Thu", visits: 21, source: "organic" },
  { day: "Fri", visits: 15, source: "ad" },
  { day: "Sat", visits: 25, source: "organic" },
];

const BUILD_CHART: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  scenario: {
    title: "Build a chart — the data behind the visual",
    role: "You're about to plot daily visits. A chart is only as good as the Series you feed it — so shape them right in pandas.",
    goal: "Each cell prepares one piece a chart needs from `df` — a labelled series, grouped totals, percentages, a cumulative, scaled heights, a histogram. Independent reps; write each from memory.",
    outcome: "That's a chart's worth of prep in pandas — set_index, groupby, cumsum, normalising, value_counts binning. Hand any of these to a plot.",
    setupCode: pdDataFrameLiteral(CHART_ROWS),
    dataset: CHART_ROWS,
  },
  cells: [
    { id: "labels", task: "Create labels — the day column (x-axis labels).", why: "The category axis is one column as a Series.",
      focus: ["day"], solution: `labels = df["day"]`, assertions: `assert list(labels) == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]`,
      narrative: `df["day"] is the x-axis — the category labels that sit under each bar.`,
      steps: [{ do: "Select the day column", code: `df["day"]` }] },
    { id: "heights", task: "Create heights — the visits column (bar heights).", why: "The y-values — the other half of a bar chart.",
      focus: ["visits"], solution: `heights = df["visits"]`, assertions: `assert list(heights) == [12, 18, 9, 21, 15, 25]`,
      narrative: `df["visits"] is the height series, paired with the day labels.`,
      steps: [{ do: "Select the visits column", code: `df["visits"]` }] },
    { id: "series", task: "Create series — visits indexed by day (a labelled Series for plotting).", why: "set_index makes a column the labels — the natural plot-ready shape.",
      focus: ["day", "visits"], solution: `series = df.set_index("day")["visits"]`, assertions: `assert series.to_dict() == {"Mon": 12, "Tue": 18, "Wed": 9, "Thu": 21, "Fri": 15, "Sat": 25}`,
      narrative: `df.set_index("day") makes day the row labels; ["visits"] then gives a Series indexed by day — exactly what a plotter wants: value-with-its-label.`,
      steps: [
        { do: "Make day the index", code: `df.set_index("day")` },
        { do: "Take the visits Series", code: `["visits"]` },
      ] },
    { id: "by_source", task: "Create by_source — total visits per source (for a grouped bar).", why: "groupby + sum gives one number per category.",
      focus: ["source", "visits"], solution: `by_source = df.groupby("source")["visits"].sum()`, assertions: `assert by_source.to_dict() == {"ad": 36, "organic": 64}`,
      narrative: `df.groupby("source")["visits"].sum() totals visits within each source — the bars of a grouped chart.`,
      steps: [
        { do: "Group by source", code: `df.groupby("source")` },
        { do: "Sum visits per group", code: `["visits"].sum()` },
      ] },
    { id: "pct", task: "Create pct — each day's visits as a % of the total, rounded to 1dp.", why: "Divide a column by its own sum — vectorised share, then .round.",
      focus: ["visits"], solution: `pct = (df["visits"] / df["visits"].sum() * 100).round(1)`, assertions: `assert list(pct) == [12.0, 18.0, 9.0, 21.0, 15.0, 25.0]`,
      narrative: `df["visits"] / df["visits"].sum() divides every value by the grand total at once; * 100 and .round(1) turn it into clean percentages.`,
      steps: [
        { do: "Each value over the total", code: `df["visits"] / df["visits"].sum()` },
        { do: "Scale to percent and round", code: `* 100).round(1)` },
      ] },
    { id: "cum", task: "Create cum — the running total of visits (for a cumulative line).", why: ".cumsum() is the built-in running total — no loop.",
      focus: ["visits"], solution: `cum = df["visits"].cumsum()`, assertions: `assert list(cum) == [12, 30, 39, 60, 75, 100]`,
      narrative: `df["visits"].cumsum() returns the running total down the column — where stdlib needs a loop, pandas has a single method.`,
      steps: [
        { do: "Select visits", code: `df["visits"]` },
        { do: "Take the cumulative sum", code: `.cumsum()` },
      ] },
    { id: "scaled", task: "Create scaled — visits divided by the max, so the tallest is 1.0 (2dp).", why: "Divide a column by its max to normalise to 0–1.",
      focus: ["visits"], solution: `scaled = (df["visits"] / df["visits"].max()).round(2)`, assertions: `assert list(scaled) == [0.48, 0.72, 0.36, 0.84, 0.6, 1.0]`,
      narrative: `Dividing the column by its max squeezes every value into 0–1, with the tallest becoming 1.0 — how you fit a series to a shared axis.`,
      steps: [
        { do: "Each value over the max", code: `df["visits"] / df["visits"].max()` },
        { do: "Round to 2dp", code: `.round(2)` },
      ] },
    { id: "bars", task: `Create bars — a text bar per row: one "#" for every 5 visits.`, why: ".map applies a function to each value — a sparkline with no plotting library.",
      focus: ["visits"], solution: `bars = (df["visits"] // 5).map(lambda k: "#" * k)`, assertions: `assert list(bars) == ["##", "###", "#", "####", "###", "#####"]`,
      narrative: `df["visits"] // 5 sets each bar's length; .map(lambda k: "#" * k) turns each length into a string of #s — an instant ASCII chart.`,
      steps: [
        { do: "Turn visits into bar lengths", code: `df["visits"] // 5` },
        { do: "Map each length to a bar", code: `.map(lambda k: "#" * k)` },
      ] },
    { id: "hist", task: "Create hist — a histogram: how many days fall in each bucket of 10 visits.", why: "Bin with integer division, then value_counts to tally — the histogram idiom.",
      focus: ["visits"], solution: `hist = (df["visits"] // 10 * 10).value_counts()`, assertions: `assert hist.to_dict() == {0: 1, 10: 3, 20: 2}`,
      narrative: `df["visits"] // 10 * 10 snaps each value to its bucket (0, 10, 20…); .value_counts() then tallies how many land in each — binning plus counting.`,
      steps: [
        { do: "Snap values to buckets", code: `df["visits"] // 10 * 10` },
        { do: "Count per bucket", code: `.value_counts()` },
      ] },
    { id: "peak", task: "Create peak — the day with the most visits (to annotate the chart).", why: "idxmax + .loc reads the label off the top row.",
      focus: ["day", "visits"], solution: `peak = df.loc[df["visits"].idxmax(), "day"]`, assertions: `assert peak == "Sat"`,
      narrative: `df["visits"].idxmax() finds the busiest row's label; df.loc[label, "day"] reads its day — the annotation point.`,
      steps: [
        { do: "Find the busiest row's label", code: `df["visits"].idxmax()` },
        { do: "Read its day", code: `df.loc[ ... , "day"]` },
      ] },
    { id: "ranked", task: "Create ranked — the days ordered by visits, busiest first (for a ranked bar).", why: "sort_values then project the label column.",
      focus: ["day", "visits"], solution: `ranked = df.sort_values("visits", ascending=False)["day"]`, assertions: `assert list(ranked) == ["Sat", "Thu", "Tue", "Fri", "Mon", "Wed"]`,
      narrative: `df.sort_values("visits", ascending=False) reorders busiest-first, and ["day"] pulls the labels — the order to draw a ranked bar chart.`,
      steps: [
        { do: "Sort by visits, busiest first", code: `df.sort_values("visits", ascending=False)` },
        { do: "Take the day column", code: `["day"]` },
      ] },
  ],
};

// ── Pack 5: Linear regression ──────────────────────────────────────────────
const REG_ROWS: DataRow[] = [
  { x: 1, y: 2 },
  { x: 2, y: 4 },
  { x: 3, y: 5 },
  { x: 4, y: 4 },
  { x: 5, y: 5 },
];

const LINEAR_REGRESSION: DrillContent = {
  dataKind: "dataframe",
  cumulative: true,
  scenario: {
    title: "Linear regression — fit a line from scratch (pandas)",
    role: "Five (x, y) points in `df` that roughly trend upward. You'll build the least-squares fit with pandas Series arithmetic.",
    goal: "These cells BUILD ON EACH OTHER: take the means, derive the slope and intercept, then predict and score. Each reuses the last — the anatomy of a regression, done vectorised on columns.",
    outcome: "You built ordinary least squares on DataFrame columns: slope 0.6, intercept 2.2, R² 0.6. Vectorised Series math, no loops.",
    setupCode: pdDataFrameLiteral(REG_ROWS),
    dataset: REG_ROWS,
  },
  cells: [
    { id: "mx", task: "Create mx — the mean of x.", why: ".mean() on the column — the x-centre the slope needs.",
      focus: ["x"], solution: `mx = df["x"].mean()`, assertions: `assert mx == 3`,
      narrative: `df["x"].mean() is the centre of the predictor — the slope formula measures how points vary around it.`,
      steps: [{ do: "Mean of the x column", code: `df["x"].mean()` }] },
    { id: "my", task: "Create my — the mean of y.", why: "The y-centre, the partner to mx.",
      focus: ["y"], solution: `my = df["y"].mean()`, assertions: `assert my == 4`,
      narrative: `df["y"].mean() centres the response; with mx and my you can express each point as its deviation from the middle.`,
      steps: [{ do: "Mean of the y column", code: `df["y"].mean()` }] },
    { id: "slope", task: "Create slope — the least-squares slope, using mx and my.", why: "Vectorised covariance over variance — Series arithmetic, no zip.",
      focus: ["x", "y"], solution: `slope = ((df["x"] - mx) * (df["y"] - my)).sum() / ((df["x"] - mx) ** 2).sum()`, assertions: `assert abs(slope - 0.6) < 1e-9`,
      narrative: `(df["x"] - mx) and (df["y"] - my) are deviation Series; multiplying and summing gives the covariance (top), while summing the squared x-deviations gives the variance (bottom). Column math replaces the loop.`,
      steps: [
        { do: "Deviations of x and y", code: `(df["x"] - mx), (df["y"] - my)` },
        { do: "Co-movement (top)", code: `((df["x"] - mx) * (df["y"] - my)).sum()` },
        { do: "x's spread (bottom)", code: `((df["x"] - mx) ** 2).sum()` },
      ] },
    { id: "intercept", task: "Create intercept — where the line crosses, using slope, mx, my.", why: "The line passes through the means — rearrange to solve for b.",
      focus: ["x", "y"], solution: `intercept = my - slope * mx`, assertions: `assert abs(intercept - 2.2) < 1e-9`,
      narrative: `The best-fit line passes through (mx, my); plugging that into y = slope·x + intercept gives intercept = my - slope·mx.`,
      steps: [{ do: "y-mean minus slope times x-mean", code: `my - slope * mx` }] },
    { id: "corr", task: "Create corr — the correlation between x and y.", why: ".corr() is pandas' built-in Pearson correlation.",
      focus: ["x", "y"], solution: `corr = df["x"].corr(df["y"])`, assertions: `assert round(corr, 4) == 0.7746`,
      narrative: `df["x"].corr(df["y"]) gives the correlation directly; for a simple regression it's the square root of R² — a quick strength check.`,
      steps: [{ do: "Correlate the two columns", code: `df["x"].corr(df["y"])` }] },
    { id: "pred", task: "Create pred — the predicted y at x = 6, using slope and intercept.", why: "Plug a new x into the fitted line.",
      focus: ["x", "y"], solution: `pred = slope * 6 + intercept`, assertions: `assert abs(pred - 5.8) < 1e-9`,
      narrative: `With slope and intercept known, the model is a line; slope·6 + intercept predicts y one step past the data.`,
      steps: [{ do: "Apply the line at x = 6", code: `slope * 6 + intercept` }] },
    { id: "fitted", task: "Create fitted — the predicted y for every x (a Series).", why: "Vectorised: the line applied to the whole x column at once.",
      focus: ["x"], solution: `fitted = slope * df["x"] + intercept`, assertions: `assert [round(v, 2) for v in fitted] == [2.8, 3.4, 4.0, 4.6, 5.2]`,
      narrative: `slope * df["x"] + intercept applies the line to every x in one Series operation — the straight line you'd overlay on the points.`,
      steps: [{ do: "Apply the line to the x column", code: `slope * df["x"] + intercept` }] },
    { id: "residuals", task: "Create residuals — actual y minus fitted y (a Series).", why: "Series subtraction gives every miss at once.",
      focus: ["x", "y"], solution: `residuals = df["y"] - (slope * df["x"] + intercept)`, assertions: `assert [round(v, 2) for v in residuals] == [-0.8, 0.6, 1.0, -0.6, -0.2]`,
      narrative: `df["y"] minus the fitted values gives the residual Series — how far each real point sits above or below the line.`,
      steps: [{ do: "Actual y minus fitted", code: `df["y"] - (slope * df["x"] + intercept)` }] },
    { id: "sse", task: "Create sse — the sum of squared residuals.", why: "Square the residual Series and .sum() — the quantity OLS minimises.",
      focus: ["x", "y"], solution: `sse = ((df["y"] - (slope * df["x"] + intercept)) ** 2).sum()`, assertions: `assert abs(sse - 2.4) < 1e-9`,
      narrative: `Squaring the residuals makes misses positive and punishes big ones; summing gives the total error — exactly what least squares makes smallest.`,
      steps: [
        { do: "Square each residual", code: `(df["y"] - (slope * df["x"] + intercept)) ** 2` },
        { do: "Sum them", code: `.sum()` },
      ] },
    { id: "r2", task: "Create r2 — the R², using sse and my.", why: "1 minus unexplained-over-total variance — the standard fit score.",
      focus: ["y"], solution: `r2 = 1 - sse / ((df["y"] - my) ** 2).sum()`, assertions: `assert abs(r2 - 0.6) < 1e-9`,
      narrative: `((df["y"] - my) ** 2).sum() is the total variance in y; sse is what's left unexplained; 1 minus their ratio is the fraction the line accounts for.`,
      steps: [
        { do: "Total variance in y", code: `((df["y"] - my) ** 2).sum()` },
        { do: "1 minus sse over it", code: `1 - sse / ...` },
      ] },
  ],
};

// ── Pack 6: Forecasting ────────────────────────────────────────────────────
const FORECAST_ROWS: DataRow[] = [
  { month: "Jan", sales: 100 },
  { month: "Feb", sales: 120 },
  { month: "Mar", sales: 140 },
  { month: "Apr", sales: 130 },
  { month: "May", sales: 160 },
  { month: "Jun", sales: 180 },
];

const FORECASTING: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  scenario: {
    title: "Forecasting — reading and extending a series (pandas)",
    role: "Six months of sales in `df`, trending up with a wobble. Measure the trend with pandas' time-series methods.",
    goal: "Each cell is one time-series move on the same `df` — diff, pct_change, rolling, ewm, cumsum. Independent reps; write each from memory. This is where pandas shines.",
    outcome: "That's the pandas forecasting kit — diff, pct_change, rolling mean, ewm (exponential smoothing), cumsum. Built-ins where stdlib needed loops.",
    setupCode: pdDataFrameLiteral(FORECAST_ROWS),
    dataset: FORECAST_ROWS,
  },
  cells: [
    { id: "series", task: "Create series — the sales column.", why: "Time-series work runs on the value Series.",
      focus: ["sales"], solution: `series = df["sales"]`, assertions: `assert list(series) == [100, 120, 140, 130, 160, 180]`,
      narrative: `df["sales"] is the ordered series every forecasting method operates on.`,
      steps: [{ do: "Select the sales column", code: `df["sales"]` }] },
    { id: "diffs", task: "Create diffs — the change from each month to the next.", why: ".diff() is the built-in period-over-period change.",
      focus: ["sales"], solution: `diffs = df["sales"].diff()`, assertions: `assert list(diffs.dropna()) == [20, 20, -10, 30, 20]`,
      narrative: `df["sales"].diff() subtracts each value from the one before it — the first entry is NaN (nothing precedes it). Where stdlib zips neighbours, pandas has a method.`,
      steps: [
        { do: "Select sales", code: `df["sales"]` },
        { do: "Take the month-over-month change", code: `.diff()` },
      ] },
    { id: "growth", task: "Create growth — each month's % change from the last, to 1dp.", why: ".pct_change() normalises the change by the previous level.",
      focus: ["sales"], solution: `growth = (df["sales"].pct_change() * 100).round(1)`, assertions: `assert list(growth.dropna()) == [20.0, 16.7, -7.1, 23.1, 12.5]`,
      narrative: `df["sales"].pct_change() gives the fractional change from the previous month; * 100 and .round(1) turn it into a clean growth percentage.`,
      steps: [
        { do: "Fractional change from prior", code: `df["sales"].pct_change()` },
        { do: "As a rounded percent", code: `* 100).round(1)` },
      ] },
    { id: "ma3", task: "Create ma3 — the 3-month rolling average.", why: ".rolling(3).mean() smooths the wobble to show the trend.",
      focus: ["sales"], solution: `ma3 = df["sales"].rolling(3).mean()`, assertions: `assert [round(v, 2) for v in ma3.dropna()] == [120.0, 130.0, 143.33, 156.67]`,
      narrative: `df["sales"].rolling(3) sets a sliding 3-month window; .mean() averages each. The first two months are NaN (no full window yet) — pandas' one-call moving average.`,
      steps: [
        { do: "Slide a 3-month window", code: `df["sales"].rolling(3)` },
        { do: "Average each window", code: `.mean()` },
      ] },
    { id: "naive", task: "Create naive — the naive forecast for next month (the last value).", why: "The baseline: next equals the most recent value.",
      focus: ["sales"], solution: `naive = df["sales"].iloc[-1]`, assertions: `assert naive == 180`,
      narrative: `df["sales"].iloc[-1] grabs the last value by position — the naive forecast every model must beat.`,
      steps: [{ do: "Take the last value by position", code: `df["sales"].iloc[-1]` }] },
    { id: "drift", task: "Create drift — next month by the drift method (last value plus average change).", why: "Extend the overall trend line one step.",
      focus: ["sales"], solution: `drift = df["sales"].iloc[-1] + (df["sales"].iloc[-1] - df["sales"].iloc[0]) / (len(df) - 1)`, assertions: `assert drift == 196`,
      narrative: `(last - first) / (n - 1) is the average change per step; adding it to the last value continues the trend from first point to last one step forward.`,
      steps: [
        { do: "Average change per step", code: `(df["sales"].iloc[-1] - df["sales"].iloc[0]) / (len(df) - 1)` },
        { do: "Add it to the last value", code: `df["sales"].iloc[-1] + ...` },
      ] },
    { id: "ma_next", task: "Create ma_next — a moving-average forecast: the mean of the last 3 months.", why: ".tail(3).mean() — steadier than the last point alone.",
      focus: ["sales"], solution: `ma_next = df["sales"].tail(3).mean()`, assertions: `assert round(ma_next, 2) == 156.67`,
      narrative: `df["sales"].tail(3) takes the last three months; .mean() averages them — a smoother next-step estimate than trusting the single latest value.`,
      steps: [
        { do: "Take the last three months", code: `df["sales"].tail(3)` },
        { do: "Average them", code: `.mean()` },
      ] },
    { id: "level", task: "Create level — exponential smoothing with alpha = 0.5 (the final level).", why: ".ewm(alpha=…) IS exponential smoothing — recent points weigh more.",
      focus: ["sales"], solution: `level = df["sales"].ewm(alpha=0.5, adjust=False).mean().iloc[-1]`, assertions: `assert round(level, 3) == 161.875`,
      narrative: `df["sales"].ewm(alpha=0.5, adjust=False).mean() is exponential smoothing done for you — each step blends the new value with the running level, decaying the past. .iloc[-1] takes the final smoothed level.`,
      steps: [
        { do: "Exponentially-weighted mean", code: `df["sales"].ewm(alpha=0.5, adjust=False).mean()` },
        { do: "Take the final level", code: `.iloc[-1]` },
      ] },
    { id: "mae", task: "Create mae — the mean absolute error of the naive one-step forecast.", why: "Chain diff → abs → mean; NaN is skipped automatically.",
      focus: ["sales"], solution: `mae = df["sales"].diff().abs().mean()`, assertions: `assert mae == 20`,
      narrative: `Predicting each month as the previous one, the error each step is |diff|. .diff().abs().mean() takes those absolute misses and averages them (skipping the leading NaN) — the MAE of the naive rule.`,
      steps: [
        { do: "Month-over-month change", code: `df["sales"].diff()` },
        { do: "Absolute value, then mean", code: `.abs().mean()` },
      ] },
    { id: "peak", task: "Create peak — the month with the highest sales.", why: "idxmax + .loc reads the label off the top row.",
      focus: ["month", "sales"], solution: `peak = df.loc[df["sales"].idxmax(), "month"]`, assertions: `assert peak == "Jun"`,
      narrative: `df["sales"].idxmax() finds the top-selling row's label; df.loc[label, "month"] reads its month — when the series topped out.`,
      steps: [
        { do: "Find the top row's label", code: `df["sales"].idxmax()` },
        { do: "Read its month", code: `df.loc[ ... , "month"]` },
      ] },
    { id: "cum", task: "Create cum — the cumulative (year-to-date) sales.", why: ".cumsum() is the running total — the YTD line.",
      focus: ["sales"], solution: `cum = df["sales"].cumsum()`, assertions: `assert list(cum) == [100, 220, 360, 490, 650, 830]`,
      narrative: `df["sales"].cumsum() returns the year-to-date total down the column, climbing to the full-year sum — no loop needed.`,
      steps: [
        { do: "Select sales", code: `df["sales"]` },
        { do: "Take the cumulative sum", code: `.cumsum()` },
      ] },
  ],
};

const PYTHON_PACKS: DrillPack[] = [
  {
    id: "clean-shape",
    title: "Clean & shape data",
    blurb: "Tidy a messy DataFrame — .str methods, .astype, masks, .assign.",
    tag: "pandas",
    lang: "python",
    content: CLEAN_SHAPE,
  },
  {
    id: "explore",
    title: "Explore a dataset",
    blurb: "First-look profile — min/max, mean, median, nunique, groupby.",
    tag: "pandas",
    lang: "python",
    content: EXPLORE_DATA,
  },
  {
    id: "build-chart",
    title: "Build a chart",
    blurb: "The data behind a visual — set_index, groupby, cumsum, binning.",
    tag: "pandas",
    lang: "python",
    content: BUILD_CHART,
  },
  {
    id: "linear-regression",
    title: "Linear regression",
    blurb: "Fit a line from scratch on columns — slope, intercept, predict, R². Builds up.",
    tag: "pandas",
    lang: "python",
    content: LINEAR_REGRESSION,
  },
  {
    id: "forecasting",
    title: "Forecasting",
    blurb: "Time-series with pandas — diff, pct_change, rolling, ewm, cumsum.",
    tag: "pandas",
    lang: "python",
    content: FORECASTING,
  },
];

export const PACKS: DrillPack[] = [
  ...LETS_DO_THIS_PACKS,
  ...PYTHON_PACKS,
  ...LOOP_PACKS,
  ...ML_PACKS,
  ...AUTOMATION_PACKS,
  ...AIRFLOW_PACKS,
  ...RAG_PACKS,
  ...SQL_PACKS,
];

export function getPack(id: string): DrillPack | undefined {
  return PACKS.find(p => p.id === id);
}
