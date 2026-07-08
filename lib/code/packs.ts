// Curated practice packs — the primary Code-pillar content.
//
// A pack is a set of BITE-SIZE, INDEPENDENT reps: each cell is one small,
// standard construct written from memory against a shared generic dataset. The
// point is fluency through repetition, not solving a novel problem — so cells
// don't build on each other (`cumulative: false`) and there's no per-topic AI
// generation. Add packs by adding entries here.
//
// This first pack is the pure-Python "everyday data moves" — the mental model
// behind pandas (filter/aggregate/group/sort), in plain stdlib so it runs
// instantly in the base Pyodide worker. A real-pandas pack (df.groupby, df.merge)
// would need pandas loaded into the worker.

import { pyRowsLiteral, type DataRow, type DrillContent } from "./drillContent";
import type { DrillLang } from "@/types/code";
import { SQL_PACKS } from "./sqlPacks";

export interface DrillPack {
  id: string;        // URL slug: /code/drill?pack=<id>
  title: string;     // card title
  blurb: string;     // one-line card description
  tag: string;       // small pill, e.g. "Python"
  lang: DrillLang;   // which language pill this pack lives under
  content: DrillContent;
}

// One source of truth for the working table — the setup Python is derived from
// this, and the drill renders it as a real dataframe (with column highlighting).
const ESSENTIALS_ROWS: DataRow[] = [
  { name: "Ann",  team: "A", sales: 30, region: "EU" },
  { name: "Ben",  team: "B", sales: 50, region: "NA" },
  { name: "Cara", team: "A", sales: 20, region: "EU" },
  { name: "Dan",  team: "B", sales: 70, region: "APAC" },
  { name: "Eve",  team: "A", sales: 20, region: "NA" },
  { name: "Finn", team: "B", sales: 50, region: "EU" },
];

const DATA_ESSENTIALS: DrillContent = {
  scenario: {
    title: "Data essentials — the everyday moves",
    role: "Fast reps on the operations you reach for constantly. Not a puzzle — just the constructs, from memory.",
    goal: "Each cell is one small, standard move on the same `rows`. They're independent — write each from memory. The point is fluency: repeat until the syntax is automatic.",
    outcome: "That's the core toolkit — filter, aggregate, group, sort. Run it again from memory to lock it in.",
    setupCode: pyRowsLiteral(ESSENTIALS_ROWS),
    dataset: ESSENTIALS_ROWS,
  },
  cumulative: false,
  cells: [
    { id: "total", task: "Create total — the sum of every row's sales.", why: "Summing a column is the most basic aggregate. A generator expression inside sum() is the pattern.",
      focus: ["sales"], solution: `total = sum(r["sales"] for r in rows)`, assertions: `assert total == 240`,
      narrative: `Read it outside-in. sum(...) collapses many numbers into one. Inside, r["sales"] pulls the sales value out of a row, and for r in rows repeats that for every row — so sum adds up all six sales into a single total.`,
      steps: [
        { do: "Know the output — one number called total", code: `total =` },
        { do: "Pull each row's sales", code: `r["sales"] for r in rows` },
        { do: "Add them all into one", code: `sum(...)` },
      ] },
    { id: "n", task: "Create n — how many rows there are.", why: "len() on the list. Trivial, but it's the reflex you want automatic.",
      focus: [], solution: `n = len(rows)`, assertions: `assert n == 6`,
      narrative: `len(...) just counts the items in a collection. Hand it the whole rows list and it hands back how many rows there are — no loop needed.`,
      steps: [
        { do: "Know the output — a count called n", code: `n =` },
        { do: "Count the items in the list", code: `len(rows)` },
      ] },
    { id: "eu", task: `Create eu — only the rows where region is "EU".`, why: "Filtering to a slice with a list comprehension + condition — the move you make constantly.",
      focus: ["region"], solution: `eu = [r for r in rows if r["region"] == "EU"]`, assertions: `assert len(eu) == 3 and all(r["region"] == "EU" for r in eu)`,
      narrative: `The square brackets build a new list. for r in rows walks every row; if r["region"] == "EU" is the gate that keeps only the rows that pass. What survives the gate is your filtered slice.`,
      steps: [
        { do: "Know the output — a list called eu", code: `eu = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Keep only rows that pass the condition", code: `if r["region"] == "EU"` },
      ] },
    { id: "names", task: "Create names — a list of just the name field from every row.", why: "Projecting one field out of each row: a list comprehension that maps, not filters.",
      focus: ["name"], solution: `names = [r["name"] for r in rows]`, assertions: `assert names == ["Ann", "Ben", "Cara", "Dan", "Eve", "Finn"]`,
      narrative: `Same list-building brackets, but no if — every row is kept. The part in front, r["name"], decides what to collect from each row, so you get a flat list of just the names.`,
      steps: [
        { do: "Know the output — a list called names", code: `names = [ ]` },
        { do: "Scan row by row (no condition — keep all)", code: `for r in rows` },
        { do: "Collect one field from each row", code: `r["name"]` },
      ] },
    { id: "big", task: "Create big — the rows where sales is 50 or more.", why: "Same filter shape, numeric threshold. Muscle memory for the comparison-in-comprehension.",
      focus: ["sales"], solution: `big = [r for r in rows if r["sales"] >= 50]`, assertions: `assert len(big) == 3`,
      narrative: `Identical shape to the EU filter — only the test changes. if r["sales"] >= 50 keeps rows whose sales clear the threshold. Swap the condition, get a different slice.`,
      steps: [
        { do: "Know the output — a list called big", code: `big = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Keep rows that clear the threshold", code: `if r["sales"] >= 50` },
      ] },
    { id: "avg", task: "Create avg — the mean of sales across all rows.", why: "Sum divided by count. The everyday average, no library needed.",
      focus: ["sales"], solution: `avg = sum(r["sales"] for r in rows) / len(rows)`, assertions: `assert avg == 40`,
      narrative: `Two familiar moves joined by a slash. sum(...) totals the sales, len(rows) counts them, and dividing one by the other is exactly the mean — total over count.`,
      steps: [
        { do: "Know the output — one number called avg", code: `avg =` },
        { do: "Total the sales", code: `sum(r["sales"] for r in rows)` },
        { do: "Count the rows", code: `len(rows)` },
        { do: "Divide total by count", code: `/` },
      ] },
    { id: "top", task: "Create top — the single row with the highest sales.", why: "max() with a key function picks the winning record — a pattern you'll reuse forever.",
      focus: ["sales"], solution: `top = max(rows, key=lambda r: r["sales"])`, assertions: `assert top["name"] == "Dan"`,
      narrative: `max(rows, ...) returns one whole row, not a number. The key= tells it how to compare: lambda r: r["sales"] means "judge each row by its sales", so you get back the row with the biggest sales.`,
      steps: [
        { do: "Know the output — one row called top", code: `top =` },
        { do: "Judge each row by its sales", code: `key=lambda r: r["sales"]` },
        { do: "Pick the biggest", code: `max(rows, ...)` },
      ] },
    { id: "by_team", task: "Create by_team — a dict mapping each team to its total sales.", why: "Group-by-and-sum, hand-rolled: dict.get(key, 0) is the accumulator idiom behind every groupby.",
      focus: ["team", "sales"], solution: `by_team = {}
for r in rows:
    by_team[r["team"]] = by_team.get(r["team"], 0) + r["sales"]`, assertions: `assert by_team == {"A": 70, "B": 170}`,
      narrative: `Start an empty dict, then walk every row. by_team.get(r["team"], 0) reads the team's running total (0 the first time it's seen), adds this row's sales, and stores it back. Repeat, and each team accumulates its own total.`,
      steps: [
        { do: "Know the output — an empty dict called by_team", code: `by_team = {}` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Read the team's running total (0 if new)", code: `by_team.get(r["team"], 0)` },
        { do: "Add this row's sales and store it back", code: `+ r["sales"]` },
      ] },
    { id: "counts", task: "Create counts — a dict mapping each team to how many rows it has.", why: "Same accumulator, counting instead of summing (+ 1). The count-by-key reflex.",
      focus: ["team"], solution: `counts = {}
for r in rows:
    counts[r["team"]] = counts.get(r["team"], 0) + 1`, assertions: `assert counts == {"A": 3, "B": 3}`,
      narrative: `The exact group-and-accumulate pattern again, with one change: you add 1 instead of the sales value. So each team's entry counts how many rows it has rather than summing them.`,
      steps: [
        { do: "Know the output — an empty dict called counts", code: `counts = {}` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Read the team's running count (0 if new)", code: `counts.get(r["team"], 0)` },
        { do: "Add one and store it back", code: `+ 1` },
      ] },
    { id: "regions", task: "Create regions — the distinct regions, sorted alphabetically.", why: "set() to dedupe, sorted() to order. The two-step you reach for to list unique values.",
      focus: ["region"], solution: `regions = sorted(set(r["region"] for r in rows))`, assertions: `assert regions == ["APAC", "EU", "NA"]`,
      narrative: `Read this one inside-out. The generator pulls every region, set(...) throws away the duplicates, and sorted(...) puts what's left in order — dedupe, then sort.`,
      steps: [
        { do: "Know the output — a sorted list called regions", code: `regions =` },
        { do: "Pull every region", code: `r["region"] for r in rows` },
        { do: "Drop duplicates", code: `set(...)` },
        { do: "Put them in order", code: `sorted(...)` },
      ] },
    { id: "ranked", task: "Create ranked — the rows sorted by sales, highest first.", why: "sorted() with key= and reverse=True. Ordering records is a daily move.",
      focus: ["sales"], solution: `ranked = sorted(rows, key=lambda r: r["sales"], reverse=True)`, assertions: `assert [r["name"] for r in ranked[:2]] == ["Dan", "Ben"]`,
      narrative: `sorted(rows, ...) returns the rows in a new order without touching the original. key=lambda r: r["sales"] sorts by the sales value, and reverse=True flips it to highest-first.`,
      steps: [
        { do: "Know the output — the rows reordered, ranked", code: `ranked =` },
        { do: "Sort by sales", code: `key=lambda r: r["sales"]` },
        { do: "Highest first", code: `reverse=True` },
      ] },
    { id: "eu_total", task: `Create eu_total — total sales for the "EU" region only.`, why: "Filter and aggregate in one pass: a condition inside the sum generator.",
      focus: ["region", "sales"], solution: `eu_total = sum(r["sales"] for r in rows if r["region"] == "EU")`, assertions: `assert eu_total == 100`,
      narrative: `Filter and total in a single pass. The if r["region"] == "EU" sits inside the generator, so non-EU rows are dropped before sum ever sees them — you total only the EU sales.`,
      steps: [
        { do: "Know the output — one number called eu_total", code: `eu_total =` },
        { do: "Take each row's sales", code: `r["sales"] for r in rows` },
        { do: "But only EU rows", code: `if r["region"] == "EU"` },
        { do: "Add them up", code: `sum(...)` },
      ] },
    { id: "top_names", task: "Create top_names — a set of names whose sales are 50 or more.", why: "A set comprehension: build a deduped collection with a condition in one line.",
      focus: ["name", "sales"], solution: `top_names = {r["name"] for r in rows if r["sales"] >= 50}`, assertions: `assert top_names == {"Ben", "Dan", "Finn"}`,
      narrative: `Curly braces with a for build a set — like a list comprehension, but duplicates drop out automatically. The if keeps the high sellers, and r["name"] collects their names.`,
      steps: [
        { do: "Know the output — a set called top_names", code: `top_names = { }` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Keep the high sellers", code: `if r["sales"] >= 50` },
        { do: "Collect their names (deduped)", code: `r["name"]` },
      ] },
    { id: "teams", task: "Create teams — how many distinct teams appear.", why: "len(set(...)) — count unique values in one expression. A tidy, common one-liner.",
      focus: ["team"], solution: `teams = len(set(r["team"] for r in rows))`, assertions: `assert teams == 2`,
      narrative: `Inside-out once more: grab every team, set(...) reduces them to the distinct ones, and len(...) counts those. len(set(...)) is the go-to for "how many unique".`,
      steps: [
        { do: "Know the output — a count called teams", code: `teams =` },
        { do: "Pull every team", code: `r["team"] for r in rows` },
        { do: "Drop duplicates", code: `set(...)` },
        { do: "Count them", code: `len(...)` },
      ] },
  ],
};

// ── Pack 2: Clean & shape data ─────────────────────────────────────────────
// A deliberately messy table — stray whitespace, mixed case, numbers stored as
// strings, a zero to drop. The reps are the everyday tidy-up moves: strip,
// lowercase, cast types, filter, dedupe, reshape into a cleaner record.
const CLEAN_ROWS: DataRow[] = [
  { name: " Ann ", city: "london", amount: "30", status: "active" },
  { name: "Ben",   city: "LONDON", amount: "50", status: "active" },
  { name: "Cara ", city: "Paris",  amount: "20", status: "ACTIVE" },
  { name: "Dan",   city: "paris",  amount: "70", status: "inactive" },
  { name: " Eve",  city: "London", amount: "0",  status: "active" },
  { name: "Finn",  city: "paris",  amount: "50", status: "Inactive" },
];

const CLEAN_SHAPE: DrillContent = {
  scenario: {
    title: "Clean & shape data — tidy a messy table",
    role: "The data came in dirty: stray spaces, inconsistent case, numbers stored as text. Whip it into shape.",
    goal: "Each cell is one standard cleaning move on the same messy `rows`. They're independent — write each from memory. These are the reps you reach for before any analysis can start.",
    outcome: "That's the tidy-up toolkit — strip, lowercase, cast types, filter, dedupe, reshape. Real cleaning is just these moves, stacked.",
    setupCode: pyRowsLiteral(CLEAN_ROWS),
    dataset: CLEAN_ROWS,
  },
  cumulative: false,
  cells: [
    { id: "trimmed", task: "Create trimmed — every name with its surrounding spaces removed.", why: "Stray whitespace is the most common dirt in real data. .strip() on each value is the reflex fix.",
      focus: ["name"], solution: `trimmed = [r["name"].strip() for r in rows]`, assertions: `assert trimmed == ["Ann", "Ben", "Cara", "Dan", "Eve", "Finn"]`,
      narrative: `A list comprehension walks every row, and .strip() shaves the spaces off both ends of each name. What you get back is the same names, cleanly trimmed.`,
      steps: [
        { do: "Know the output — a list called trimmed", code: `trimmed = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Strip the spaces off each name", code: `r["name"].strip()` },
      ] },
    { id: "cities", task: "Create cities — every city lowercased so the casing is consistent.", why: "\"London\" and \"LONDON\" are the same place. Normalising case is how you stop counting them twice.",
      focus: ["city"], solution: `cities = [r["city"].lower() for r in rows]`, assertions: `assert cities == ["london", "london", "paris", "paris", "london", "paris"]`,
      narrative: `.lower() forces every city into the same case, so mixed-up capitals stop being treated as different values. The comprehension applies it to every row.`,
      steps: [
        { do: "Know the output — a list called cities", code: `cities = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Lowercase each city", code: `r["city"].lower()` },
      ] },
    { id: "amounts", task: "Create amounts — the amount of each row as a real integer.", why: "Numbers arrive as text constantly. int() casts the string so you can actually do maths with it.",
      focus: ["amount"], solution: `amounts = [int(r["amount"]) for r in rows]`, assertions: `assert amounts == [30, 50, 20, 70, 0, 50]`,
      narrative: `The amounts are strings like "30" — useless for arithmetic until converted. int(...) turns each one into a number, so amounts is a list you can sum, compare, or average.`,
      steps: [
        { do: "Know the output — a list called amounts", code: `amounts = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Cast the text to an integer", code: `int(r["amount"])` },
      ] },
    { id: "total", task: "Create total — the sum of every amount (convert as you go).", why: "Aggregating text-numbers means casting inside the sum. int() in the generator is the one-pass idiom.",
      focus: ["amount"], solution: `total = sum(int(r["amount"]) for r in rows)`, assertions: `assert total == 220`,
      narrative: `You can clean and total in a single pass: int(r["amount"]) converts each value the instant it's read, and sum(...) adds the converted numbers straight up.`,
      steps: [
        { do: "Know the output — one number called total", code: `total =` },
        { do: "Convert each amount as it's read", code: `int(r["amount"]) for r in rows` },
        { do: "Add them all up", code: `sum(...)` },
      ] },
    { id: "nonzero", task: "Create nonzero — only the rows whose amount is above zero.", why: "Dropping empty / zero records is a routine cleaning filter. Cast, then compare, inside the comprehension.",
      focus: ["amount"], solution: `nonzero = [r for r in rows if int(r["amount"]) > 0]`, assertions: `assert len(nonzero) == 5`,
      narrative: `A filtering comprehension keeps a row only when its gate passes. Here the gate converts the amount and checks it's above zero, so the empty (0) record drops out.`,
      steps: [
        { do: "Know the output — a list called nonzero", code: `nonzero = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Keep rows whose amount clears zero", code: `if int(r["amount"]) > 0` },
      ] },
    { id: "cities_uniq", task: "Create cities_uniq — the distinct cities, normalised and sorted.", why: "Dedupe after normalising, or the casing splits your uniques. lower() → set() → sorted() is the combo.",
      focus: ["city"], solution: `cities_uniq = sorted(set(r["city"].lower() for r in rows))`, assertions: `assert cities_uniq == ["london", "paris"]`,
      narrative: `Read it inside-out. Lowercasing first means "London" and "LONDON" collapse together; set(...) drops the duplicates; sorted(...) orders what's left. Normalise, dedupe, sort.`,
      steps: [
        { do: "Know the output — a sorted list called cities_uniq", code: `cities_uniq =` },
        { do: "Lowercase every city", code: `r["city"].lower() for r in rows` },
        { do: "Drop duplicates", code: `set(...)` },
        { do: "Put them in order", code: `sorted(...)` },
      ] },
    { id: "active", task: `Create active — a True/False for each row: is its status "active"?`, why: "Normalising a label to a clean boolean is a daily move. Strip + lower, then compare.",
      focus: ["status"], solution: `active = [r["status"].strip().lower() == "active" for r in rows]`, assertions: `assert active == [True, True, True, False, True, False]`,
      narrative: `The status field is inconsistent — "ACTIVE", "active", "Inactive". Chaining .strip().lower() flattens the noise, and the == "active" test turns each one into a clean True or False.`,
      steps: [
        { do: "Know the output — a list of booleans called active", code: `active = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Normalise the status text", code: `r["status"].strip().lower()` },
        { do: "Test whether it equals \"active\"", code: `== "active"` },
      ] },
    { id: "clean", task: "Create clean — new rows with name stripped, city lowercased, amount as int.", why: "Rebuilding each record as a tidy dict is the heart of reshaping. A dict inside a comprehension.",
      focus: ["name", "city", "amount"], solution: `clean = [{"name": r["name"].strip(), "city": r["city"].lower(), "amount": int(r["amount"])} for r in rows]`, assertions: `assert clean[0] == {"name": "Ann", "city": "london", "amount": 30} and len(clean) == 6`,
      narrative: `Instead of cleaning one field, you rebuild the whole record: the comprehension produces a fresh dict per row, applying the right fix to each field at once. Out comes a fully tidy table.`,
      steps: [
        { do: "Know the output — a list of tidy dicts called clean", code: `clean = [ { } ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Build a new dict, fixing each field", code: `{"name": ..., "city": ..., "amount": ...}` },
      ] },
    { id: "flagged", task: `Create flagged — each row plus a "big" field: "yes" if amount ≥ 50, else "no".`, why: "Adding a derived column is everyday feature work. {**r, ...} copies a row and tacks on a new key.",
      focus: ["amount"], solution: `flagged = [{**r, "big": "yes" if int(r["amount"]) >= 50 else "no"} for r in rows]`, assertions: `assert sum(1 for r in flagged if r["big"] == "yes") == 3`,
      narrative: `{**r, ...} spreads the existing row into a new dict, then adds a "big" field. The inline if/else labels each row "yes" or "no" by its amount — a derived column in one line.`,
      steps: [
        { do: "Know the output — rows with an extra field, called flagged", code: `flagged = [ { } ]` },
        { do: "Copy the whole row", code: `{**r, ...}` },
        { do: "Add a derived flag", code: `"big": "yes" if int(r["amount"]) >= 50 else "no"` },
      ] },
    { id: "slim", task: `Create slim — rows keeping only the name (as "who") and amount (as "spend").`, why: "Projecting and renaming to a smaller shape is routine. A dict comprehension with new keys.",
      focus: ["name", "amount"], solution: `slim = [{"who": r["name"].strip(), "spend": int(r["amount"])} for r in rows]`, assertions: `assert slim[1] == {"who": "Ben", "spend": 50}`,
      narrative: `Sometimes you want fewer, better-named columns. This builds a new dict per row with just two keys — "who" and "spend" — mapping the old fields across and cleaning them on the way.`,
      steps: [
        { do: "Know the output — a slimmer list of dicts called slim", code: `slim = [ { } ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Keep just two fields, renamed", code: `{"who": ..., "spend": ...}` },
      ] },
  ],
};

// ── Pack 3: Explore a dataset ──────────────────────────────────────────────
// A clean numeric table (reps + revenue by region). The reps are the profiling
// moves you make when you first meet data: range, mean, median, group averages,
// ranking, share — the "what's in here?" pass.
const EXPLORE_ROWS: DataRow[] = [
  { rep: "Ann",  region: "EU",   deals: 4, revenue: 120 },
  { rep: "Ben",  region: "NA",   deals: 7, revenue: 210 },
  { rep: "Cara", region: "EU",   deals: 2, revenue: 60 },
  { rep: "Dan",  region: "APAC", deals: 9, revenue: 270 },
  { rep: "Eve",  region: "NA",   deals: 5, revenue: 150 },
  { rep: "Finn", region: "EU",   deals: 6, revenue: 180 },
];

const EXPLORE_DATA: DrillContent = {
  scenario: {
    title: "Explore a dataset — the first-look profile",
    role: "New table just landed. Before any deep analysis, you size it up: how big, how spread, who leads.",
    goal: "Each cell is one profiling move on the same `rows`. They're independent — write each from memory. This is the reflex pass you run to understand any dataset you meet.",
    outcome: "That's a first-look profile — extremes, centre, spread, group averages, ranking, share. Do this on anything before you trust it.",
    setupCode: pyRowsLiteral(EXPLORE_ROWS),
    dataset: EXPLORE_ROWS,
  },
  cumulative: false,
  cells: [
    { id: "hi", task: "Create hi — the largest revenue in the table.", why: "The top of the range is the first thing you check. max() over a generator of one field.",
      focus: ["revenue"], solution: `hi = max(r["revenue"] for r in rows)`, assertions: `assert hi == 270`,
      narrative: `max(...) scans a stream of values and keeps the biggest. The generator r["revenue"] for r in rows feeds it every revenue, so hi is the single highest.`,
      steps: [
        { do: "Know the output — one number called hi", code: `hi =` },
        { do: "Stream every revenue", code: `r["revenue"] for r in rows` },
        { do: "Keep the biggest", code: `max(...)` },
      ] },
    { id: "lo", task: "Create lo — the smallest revenue in the table.", why: "The bottom of the range, the mirror of max. Same shape, min() instead.",
      focus: ["revenue"], solution: `lo = min(r["revenue"] for r in rows)`, assertions: `assert lo == 60`,
      narrative: `Identical to the max move, flipped: min(...) keeps the smallest value from the same stream of revenues. Together hi and lo bracket your data.`,
      steps: [
        { do: "Know the output — one number called lo", code: `lo =` },
        { do: "Stream every revenue", code: `r["revenue"] for r in rows` },
        { do: "Keep the smallest", code: `min(...)` },
      ] },
    { id: "spread", task: "Create spread — the range of revenue (largest minus smallest).", why: "Range is the quickest read on how spread out a column is. max() minus min().",
      focus: ["revenue"], solution: `spread = max(r["revenue"] for r in rows) - min(r["revenue"] for r in rows)`, assertions: `assert spread == 210`,
      narrative: `Spread is just the top minus the bottom. Compute max and min over the same revenues and subtract — one number that tells you how wide the data reaches.`,
      steps: [
        { do: "Know the output — one number called spread", code: `spread =` },
        { do: "Take the highest revenue", code: `max(r["revenue"] for r in rows)` },
        { do: "Subtract the lowest", code: `- min(...)` },
      ] },
    { id: "mean_rev", task: "Create mean_rev — the average revenue across all reps.", why: "The centre of the data. Sum over count — the everyday mean, no library.",
      focus: ["revenue"], solution: `mean_rev = sum(r["revenue"] for r in rows) / len(rows)`, assertions: `assert mean_rev == 165`,
      narrative: `Total the revenues with sum(...), count the rows with len(rows), divide one by the other. That ratio is the mean — the balance point of the column.`,
      steps: [
        { do: "Know the output — one number called mean_rev", code: `mean_rev =` },
        { do: "Total the revenue", code: `sum(r["revenue"] for r in rows)` },
        { do: "Divide by the row count", code: `/ len(rows)` },
      ] },
    { id: "med", task: "Create med — the median revenue.", why: "The median resists outliers where the mean doesn't. statistics.median does it in one call.",
      focus: ["revenue"], solution: `from statistics import median
med = median([r["revenue"] for r in rows])`, assertions: `assert med == 165`,
      narrative: `The median is the middle value once sorted — robust to a stray huge number. Rather than sort by hand, you import median from the statistics module and hand it the list of revenues.`,
      steps: [
        { do: "Bring in the helper", code: `from statistics import median` },
        { do: "Collect the revenues into a list", code: `[r["revenue"] for r in rows]` },
        { do: "Take the middle value", code: `median(...)` },
      ] },
    { id: "top", task: "Create top — the name of the rep with the highest revenue.", why: "Finding the leading record is a constant. max() with a key, then read one field off the winner.",
      focus: ["rep", "revenue"], solution: `top = max(rows, key=lambda r: r["revenue"])["rep"]`, assertions: `assert top == "Dan"`,
      narrative: `max(rows, key=...) returns the whole winning row, judged by revenue. Tacking on ["rep"] pulls that row's name — so top is who leads, not just the number.`,
      steps: [
        { do: "Know the output — a name called top", code: `top =` },
        { do: "Judge each row by revenue", code: `key=lambda r: r["revenue"]` },
        { do: "Take the winning row, then its name", code: `max(rows, ...)["rep"]` },
      ] },
    { id: "n_regions", task: "Create n_regions — how many distinct regions appear.", why: "Counting unique values sizes a category. len(set(...)) is the one-liner for it.",
      focus: ["region"], solution: `n_regions = len(set(r["region"] for r in rows))`, assertions: `assert n_regions == 3`,
      narrative: `Pull every region, let set(...) reduce them to the distinct ones, and len(...) counts those. len(set(...)) answers "how many different?" in a single expression.`,
      steps: [
        { do: "Know the output — a count called n_regions", code: `n_regions =` },
        { do: "Pull every region", code: `r["region"] for r in rows` },
        { do: "Drop duplicates", code: `set(...)` },
        { do: "Count what's left", code: `len(...)` },
      ] },
    { id: "share", task: "Create share — the top revenue as a fraction of total revenue.", why: "\"What slice is the biggest?\" is a share calc: one part over the whole.",
      focus: ["revenue"], solution: `share = max(r["revenue"] for r in rows) / sum(r["revenue"] for r in rows)`, assertions: `assert round(share, 4) == 0.2727`,
      narrative: `A share is a part divided by the whole. The biggest revenue (max) is the part; the sum of all revenue is the whole; dividing gives the fraction the leader accounts for.`,
      steps: [
        { do: "Know the output — a fraction called share", code: `share =` },
        { do: "Take the biggest revenue (the part)", code: `max(r["revenue"] for r in rows)` },
        { do: "Divide by total revenue (the whole)", code: `/ sum(...)` },
      ] },
    { id: "above", task: "Create above — how many reps beat the average revenue.", why: "Counting rows past a computed threshold is a two-step you'll reuse: compute the mean, then count over it.",
      focus: ["revenue"], solution: `m = sum(r["revenue"] for r in rows) / len(rows)
above = sum(1 for r in rows if r["revenue"] > m)`, assertions: `assert above == 3`,
      narrative: `First compute the mean into m. Then sum(1 for ... if ...) counts by adding 1 for each row whose revenue clears m — a count-with-a-condition on top of a value you just derived.`,
      steps: [
        { do: "Compute the mean first", code: `m = sum(...) / len(rows)` },
        { do: "Add 1 for each row above it", code: `1 for r in rows if r["revenue"] > m` },
        { do: "Sum those ones into a count", code: `above = sum(...)` },
      ] },
    { id: "by_region_avg", task: "Create by_region_avg — a dict of each region's average revenue.", why: "Group-then-average is the core of exploration: accumulate sums and counts per key, then divide.",
      focus: ["region", "revenue"], solution: `sums, counts = {}, {}
for r in rows:
    sums[r["region"]] = sums.get(r["region"], 0) + r["revenue"]
    counts[r["region"]] = counts.get(r["region"], 0) + 1
by_region_avg = {k: sums[k] / counts[k] for k in sums}`, assertions: `assert by_region_avg == {"EU": 120, "NA": 180, "APAC": 270}`,
      narrative: `You can't average per group in one pass, so you keep two running dicts: total revenue and row count per region. Once both are built, a dict comprehension divides sum by count for each region to get its mean.`,
      steps: [
        { do: "Start two empty dicts — sums and counts", code: `sums, counts = {}, {}` },
        { do: "Per row, add revenue to its region's sum", code: `sums[r["region"]] = sums.get(...) + r["revenue"]` },
        { do: "And bump that region's count", code: `counts[r["region"]] = counts.get(...) + 1` },
        { do: "Divide sum by count per region", code: `{k: sums[k] / counts[k] for k in sums}` },
      ] },
    { id: "ranked", task: "Create ranked — the rep names ordered by revenue, highest first.", why: "A leaderboard is sort-then-project: order the rows, then pull the label off each.",
      focus: ["rep", "revenue"], solution: `ranked = [r["rep"] for r in sorted(rows, key=lambda r: r["revenue"], reverse=True)]`, assertions: `assert ranked == ["Dan", "Ben", "Finn", "Eve", "Ann", "Cara"]`,
      narrative: `sorted(rows, key=..., reverse=True) reorders the rows highest-revenue-first without touching the original. The outer comprehension then pulls just the rep name off each, giving a clean ranking.`,
      steps: [
        { do: "Know the output — an ordered list of names called ranked", code: `ranked = [ ]` },
        { do: "Sort the rows by revenue, highest first", code: `sorted(rows, key=..., reverse=True)` },
        { do: "Pull the name off each sorted row", code: `r["rep"] for r in ...` },
      ] },
  ],
};

// ── Pack 4: Build a chart ──────────────────────────────────────────────────
// No matplotlib in the pure-Python worker — and that's the point. A chart is
// only as honest as the numbers behind it, so these reps drill the DATA PREP a
// visual needs: label/value series, grouped totals, percentages, cumulatives,
// axis scaling, binning a histogram, even a tiny ASCII bar.
const CHART_ROWS: DataRow[] = [
  { day: "Mon", visits: 12, source: "ad" },
  { day: "Tue", visits: 18, source: "organic" },
  { day: "Wed", visits: 9,  source: "ad" },
  { day: "Thu", visits: 21, source: "organic" },
  { day: "Fri", visits: 15, source: "ad" },
  { day: "Sat", visits: 25, source: "organic" },
];

const BUILD_CHART: DrillContent = {
  scenario: {
    title: "Build a chart — the data behind the visual",
    role: "You're about to plot daily visits. A chart is only as good as the arrays you feed it — so shape them right.",
    goal: "Each cell prepares one piece a chart needs — a series, grouped totals, percentages, a cumulative line, scaled heights, a histogram. Independent reps; write each from memory. This is what you do before any plotting call.",
    outcome: "That's a chart's worth of prep — labels, heights, shares, running totals, bins, scaling. Hand any of these to a plotting library and the picture draws itself.",
    setupCode: pyRowsLiteral(CHART_ROWS),
    dataset: CHART_ROWS,
  },
  cumulative: false,
  cells: [
    { id: "labels", task: "Create labels — the x-axis labels (each row's day).", why: "Every chart needs its category axis. Projecting one field to a list is that axis.",
      focus: ["day"], solution: `labels = [r["day"] for r in rows]`, assertions: `assert labels == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]`,
      narrative: `The x-axis is just the categories in order. A comprehension pulls r["day"] off every row into a flat list — the labels that will sit under each bar.`,
      steps: [
        { do: "Know the output — a list called labels", code: `labels = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Take each day", code: `r["day"]` },
      ] },
    { id: "heights", task: "Create heights — the bar heights (each row's visits).", why: "The y-values are the other half of a bar chart. Same projection, the numeric field.",
      focus: ["visits"], solution: `heights = [r["visits"] for r in rows]`, assertions: `assert heights == [12, 18, 9, 21, 15, 25]`,
      narrative: `Paired with the labels, these are how tall each bar stands. The comprehension collects r["visits"] from every row into the y-series.`,
      steps: [
        { do: "Know the output — a list called heights", code: `heights = [ ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Take each visit count", code: `r["visits"]` },
      ] },
    { id: "series", task: "Create series — a list of (day, visits) pairs.", why: "Many plotters want (x, y) points, not two lists. Building tuples in a comprehension is the move.",
      focus: ["day", "visits"], solution: `series = [(r["day"], r["visits"]) for r in rows]`, assertions: `assert series[0] == ("Mon", 12) and len(series) == 6`,
      narrative: `Instead of separate label and height lists, some APIs want the point itself. Wrapping (r["day"], r["visits"]) makes each row a coordinate pair, so series is a list of ready-to-plot points.`,
      steps: [
        { do: "Know the output — a list of pairs called series", code: `series = [ ( ) ]` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Pair the label with its value", code: `(r["day"], r["visits"])` },
      ] },
    { id: "by_source", task: "Create by_source — total visits per source (for a grouped bar).", why: "Grouped and stacked charts start from grouped totals. The dict.get accumulator builds them.",
      focus: ["source", "visits"], solution: `by_source = {}
for r in rows:
    by_source[r["source"]] = by_source.get(r["source"], 0) + r["visits"]`, assertions: `assert by_source == {"ad": 36, "organic": 64}`,
      narrative: `A grouped bar needs one number per category. Walk the rows, and for each source read its running total (0 if new), add this row's visits, store it back — so each source ends with its combined total.`,
      steps: [
        { do: "Start an empty dict called by_source", code: `by_source = {}` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Read the source's running total (0 if new)", code: `by_source.get(r["source"], 0)` },
        { do: "Add this row's visits and store it back", code: `+ r["visits"]` },
      ] },
    { id: "pct", task: "Create pct — each day's visits as a percentage of the total, rounded to 1dp.", why: "Pie slices and share bars need percentages. Divide each value by the whole, times 100.",
      focus: ["visits"], solution: `pct = [round(r["visits"] / sum(x["visits"] for x in rows) * 100, 1) for r in rows]`, assertions: `assert pct == [12.0, 18.0, 9.0, 21.0, 15.0, 25.0]`,
      narrative: `Each slice is a part over the whole. For every row, its visits divided by the grand total, times 100, gives its percentage — and round(..., 1) keeps it to one decimal for a clean label.`,
      steps: [
        { do: "Know the output — a list of percents called pct", code: `pct = [ ]` },
        { do: "Divide each row's visits by the total", code: `r["visits"] / sum(x["visits"] for x in rows)` },
        { do: "Scale to a percentage and round", code: `* 100, 1` },
      ] },
    { id: "cum", task: "Create cum — the running total of visits (for a cumulative line).", why: "Cumulative and Pareto charts need a running sum. Carry a total through a loop, appending as you go.",
      focus: ["visits"], solution: `running = 0
cum = []
for r in rows:
    running += r["visits"]
    cum.append(running)`, assertions: `assert cum == [12, 30, 39, 60, 75, 100]`,
      narrative: `A running total can't be a plain comprehension — you need memory between rows. Keep a running counter, add each row's visits to it, and append the new total each step, so cum climbs to the full sum.`,
      steps: [
        { do: "Start a running total and an empty list", code: `running = 0\ncum = []` },
        { do: "Scan row by row", code: `for r in rows` },
        { do: "Add this row's visits to the running total", code: `running += r["visits"]` },
        { do: "Record the total so far", code: `cum.append(running)` },
      ] },
    { id: "scaled", task: "Create scaled — visits divided by the max, so the tallest is 1.0 (rounded 2dp).", why: "Normalising to 0–1 is how you fit any series to an axis or a shared scale.",
      focus: ["visits"], solution: `scaled = [round(r["visits"] / max(x["visits"] for x in rows), 2) for r in rows]`, assertions: `assert scaled == [0.48, 0.72, 0.36, 0.84, 0.6, 1.0]`,
      narrative: `Dividing every value by the maximum squeezes the series into 0–1, with the tallest becoming exactly 1.0. That's how you make different-scaled series comparable, or fit bars to a fixed height.`,
      steps: [
        { do: "Know the output — a list of 0–1 values called scaled", code: `scaled = [ ]` },
        { do: "Divide each row's visits by the biggest", code: `r["visits"] / max(x["visits"] for x in rows)` },
        { do: "Round to two decimals", code: `round(..., 2)` },
      ] },
    { id: "bars", task: `Create bars — a text bar per row: one "#" for every 5 visits.`, why: "A sparkline in text. Multiplying a string draws a bar with zero plotting libraries.",
      focus: ["visits"], solution: `bars = ["#" * (r["visits"] // 5) for r in rows]`, assertions: `assert bars == ["##", "###", "#", "####", "###", "#####"]`,
      narrative: `"#" * n repeats the character n times, so it literally draws a bar. Integer-dividing visits by 5 sets the length, and the comprehension makes one bar string per row — an instant ASCII chart.`,
      steps: [
        { do: "Know the output — a list of bar strings called bars", code: `bars = [ ]` },
        { do: "Turn visits into a bar length", code: `r["visits"] // 5` },
        { do: `Repeat "#" that many times`, code: `"#" * ...` },
      ] },
    { id: "hist", task: "Create hist — a histogram: how many days fall in each bucket of 10 visits.", why: "A histogram is binning + counting. Floor to the bucket, then accumulate — the core construct.",
      focus: ["visits"], solution: `hist = {}
for r in rows:
    b = r["visits"] // 10 * 10
    hist[b] = hist.get(b, 0) + 1`, assertions: `assert hist == {10: 3, 0: 1, 20: 2}`,
      narrative: `Binning is the whole trick behind a histogram. r["visits"] // 10 * 10 snaps each value down to its bucket (0, 10, 20…), and the get-accumulator counts how many rows land in each bucket.`,
      steps: [
        { do: "Start an empty dict called hist", code: `hist = {}` },
        { do: "Snap each value to its bucket", code: `b = r["visits"] // 10 * 10` },
        { do: "Count one into that bucket", code: `hist[b] = hist.get(b, 0) + 1` },
      ] },
    { id: "peak", task: "Create peak — the day with the most visits (to annotate the chart).", why: "Charts often call out the high point. max() with a key finds the winning row; read its label.",
      focus: ["day", "visits"], solution: `peak = max(rows, key=lambda r: r["visits"])["day"]`, assertions: `assert peak == "Sat"`,
      narrative: `To label the tallest bar, you need which row it is. max(rows, key=...) picks the row with the most visits, and ["day"] reads its label — the annotation point.`,
      steps: [
        { do: "Know the output — a day called peak", code: `peak =` },
        { do: "Judge each row by visits", code: `key=lambda r: r["visits"]` },
        { do: "Take the winner's day", code: `max(rows, ...)["day"]` },
      ] },
    { id: "ranked", task: "Create ranked — the days ordered by visits, busiest first (for a ranked bar).", why: "A sorted bar chart reads best. Sort the rows, then project the label off each.",
      focus: ["day", "visits"], solution: `ranked = [r["day"] for r in sorted(rows, key=lambda r: r["visits"], reverse=True)]`, assertions: `assert ranked == ["Sat", "Thu", "Tue", "Fri", "Mon", "Wed"]`,
      narrative: `Ordering bars biggest-first makes a chart instantly legible. sorted(rows, key=..., reverse=True) reorders by visits, and the comprehension pulls each day out in that new order.`,
      steps: [
        { do: "Know the output — ordered days called ranked", code: `ranked = [ ]` },
        { do: "Sort rows by visits, busiest first", code: `sorted(rows, key=..., reverse=True)` },
        { do: "Pull the day off each", code: `r["day"] for r in ...` },
      ] },
  ],
};

// ── Pack 5: Linear regression ──────────────────────────────────────────────
// Ordinary least squares, from scratch, in stdlib. This pack is CUMULATIVE: the
// cells build a real regression step by step (xs, ys → means → slope → intercept
// → predictions → residuals → R²), each reusing the last. Data sits slightly off
// a perfect line so residuals and R² are meaningful.
const REG_ROWS: DataRow[] = [
  { x: 1, y: 2 },
  { x: 2, y: 4 },
  { x: 3, y: 5 },
  { x: 4, y: 4 },
  { x: 5, y: 5 },
];

const LINEAR_REGRESSION: DrillContent = {
  scenario: {
    title: "Linear regression — fit a line from scratch",
    role: "Five (x, y) points that roughly trend upward. No sklearn — you'll build the least-squares fit yourself.",
    goal: "These cells BUILD ON EACH OTHER: extract the columns, take the means, derive the slope and intercept, then predict and score the fit. Each reuses the last — this is the anatomy of a regression, not a black box.",
    outcome: "You built ordinary least squares by hand: slope 0.6, intercept 2.2, R² 0.6. Every regression library does exactly this underneath.",
    setupCode: pyRowsLiteral(REG_ROWS),
    dataset: REG_ROWS,
  },
  cumulative: true,
  cells: [
    { id: "xs", task: "Create xs — the list of x values.", why: "Regression works on parallel number lists. Pull the predictor column out first.",
      focus: ["x"], solution: `xs = [r["x"] for r in rows]`, assertions: `assert xs == [1, 2, 3, 4, 5]`,
      narrative: `The maths wants plain lists of numbers, not dicts. A comprehension lifts the x value out of every row into xs — the predictor, ready to work with.`,
      steps: [
        { do: "Know the output — a list called xs", code: `xs = [ ]` },
        { do: "Pull each row's x", code: `r["x"] for r in rows` },
      ] },
    { id: "ys", task: "Create ys — the list of y values.", why: "The response column, its own parallel list. Same projection, the other field.",
      focus: ["y"], solution: `ys = [r["y"] for r in rows]`, assertions: `assert ys == [2, 4, 5, 4, 5]`,
      narrative: `The same move for the thing you're predicting: ys collects every y, lined up index-for-index with xs so the two can be zipped together later.`,
      steps: [
        { do: "Know the output — a list called ys", code: `ys = [ ]` },
        { do: "Pull each row's y", code: `r["y"] for r in rows` },
      ] },
    { id: "mx", task: "Create mx — the mean of xs.", why: "Least squares is built around deviations from the means. You need the x-mean first.",
      focus: ["x"], solution: `mx = sum(xs) / len(xs)`, assertions: `assert mx == 3`,
      narrative: `The slope formula measures how x and y vary around their centres, so you compute those centres now. sum(xs) / len(xs) is the mean of x, reused in every step that follows.`,
      steps: [
        { do: "Know the output — one number called mx", code: `mx =` },
        { do: "Total xs and divide by how many", code: `sum(xs) / len(xs)` },
      ] },
    { id: "my", task: "Create my — the mean of ys.", why: "The y-centre, the partner to mx. Both anchor the deviation maths.",
      focus: ["y"], solution: `my = sum(ys) / len(ys)`, assertions: `assert my == 4`,
      narrative: `The same mean, for y. With mx and my in hand you can express every point as how far it sits from the centre — which is exactly what the slope needs.`,
      steps: [
        { do: "Know the output — one number called my", code: `my =` },
        { do: "Total ys and divide by how many", code: `sum(ys) / len(ys)` },
      ] },
    { id: "slope", task: "Create slope — the least-squares slope, using mx and my.", why: "The heart of the fit: covariance of x,y over variance of x. zip() walks the two lists together.",
      focus: ["x", "y"], solution: `slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)`, assertions: `assert abs(slope - 0.6) < 1e-9`,
      narrative: `The slope is how much x and y move together, divided by how much x moves on its own. zip(xs, ys) pairs each x with its y; the top sums (x-mx)(y-my); the bottom sums (x-mx)² — covariance over variance.`,
      steps: [
        { do: "Pair each x with its y", code: `for x, y in zip(xs, ys)` },
        { do: "Sum the co-movement (top)", code: `sum((x - mx) * (y - my) ...)` },
        { do: "Sum x's own spread (bottom)", code: `sum((x - mx) ** 2 for x in xs)` },
        { do: "Divide top by bottom", code: `/` },
      ] },
    { id: "intercept", task: "Create intercept — where the fitted line crosses, using slope, mx, my.", why: "The line must pass through the means. Rearranging y = slope·x + b gives the intercept directly.",
      focus: ["x", "y"], solution: `intercept = my - slope * mx`, assertions: `assert abs(intercept - 2.2) < 1e-9`,
      narrative: `The best-fit line always passes through (mx, my). Plug that point into y = slope·x + intercept and solve for the intercept: my - slope·mx. One line, no iteration.`,
      steps: [
        { do: "Know the output — one number called intercept", code: `intercept =` },
        { do: "Start from the y-mean", code: `my` },
        { do: "Subtract slope times the x-mean", code: `- slope * mx` },
      ] },
    { id: "pred", task: "Create pred — the predicted y at x = 6, using slope and intercept.", why: "Prediction is the payoff: plug a new x into the fitted line.",
      focus: ["x", "y"], solution: `pred = slope * 6 + intercept`, assertions: `assert abs(pred - 5.8) < 1e-9`,
      narrative: `With slope and intercept known, the model is just a line. Feed it a new x (here 6) and slope·x + intercept returns the prediction — extrapolating one step past the data.`,
      steps: [
        { do: "Know the output — a predicted value called pred", code: `pred =` },
        { do: "Apply the line at x = 6", code: `slope * 6 + intercept` },
      ] },
    { id: "fitted", task: "Create fitted — the predicted y for each x in xs.", why: "The fitted line, point by point — what you'd draw through the scatter.",
      focus: ["x"], solution: `fitted = [slope * x + intercept for x in xs]`, assertions: `assert all(abs(a - b) < 1e-9 for a, b in zip(fitted, [2.8, 3.4, 4.0, 4.6, 5.2]))`,
      narrative: `Applying the line to every x gives the values the model expects — the straight line you'd overlay on the points. A comprehension runs slope·x + intercept across all of xs.`,
      steps: [
        { do: "Know the output — a list called fitted", code: `fitted = [ ]` },
        { do: "Apply the line to each x", code: `slope * x + intercept for x in xs` },
      ] },
    { id: "residuals", task: "Create residuals — actual y minus fitted y, for each point.", why: "Residuals are where the model misses. They drive every goodness-of-fit measure.",
      focus: ["x", "y"], solution: `residuals = [y - (slope * x + intercept) for x, y in zip(xs, ys)]`, assertions: `assert all(abs(a - b) < 1e-9 for a, b in zip(residuals, [-0.8, 0.6, 1.0, -0.6, -0.2]))`,
      narrative: `A residual is how far a real point sits above or below the line. zip(xs, ys) walks the points; for each, actual y minus the fitted slope·x + intercept is the miss — positive above the line, negative below.`,
      steps: [
        { do: "Pair each x with its y", code: `for x, y in zip(xs, ys)` },
        { do: "Compute the fitted value", code: `slope * x + intercept` },
        { do: "Subtract it from the actual y", code: `y - (...)` },
      ] },
    { id: "sse", task: "Create sse — the sum of squared residuals.", why: "SSE is the quantity least squares minimises. Square each miss, add them up.",
      focus: ["x", "y"], solution: `sse = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))`, assertions: `assert abs(sse - 2.4) < 1e-9`,
      narrative: `Squaring each residual makes misses positive and punishes big ones harder; summing them gives the total error the fit leaves behind. This SSE is exactly what "least squares" makes as small as possible.`,
      steps: [
        { do: "Take each residual", code: `y - (slope * x + intercept)` },
        { do: "Square it", code: `** 2` },
        { do: "Add them all up", code: `sum(...)` },
      ] },
    { id: "r2", task: "Create r2 — the R², using sse and my.", why: "R² reports the share of variance the line explains — the standard fit score.",
      focus: ["y"], solution: `r2 = 1 - sse / sum((y - my) ** 2 for y in ys)`, assertions: `assert abs(r2 - 0.6) < 1e-9`,
      narrative: `R² compares your error to the error of just guessing the mean. The bottom sums (y-my)² — the total variance in y; sse is what's left unexplained; 1 minus their ratio is the fraction the line accounts for.`,
      steps: [
        { do: "Sum the total variance in y", code: `sum((y - my) ** 2 for y in ys)` },
        { do: "Divide leftover error by it", code: `sse / ...` },
        { do: "Subtract from one", code: `1 - ...` },
      ] },
  ],
};

// ── Pack 6: Forecasting ────────────────────────────────────────────────────
// Six months of sales. Pure-Python time-series reps: the moves you make to
// understand and extend a series — differences, growth rates, moving averages,
// naive/drift/smoothing forecasts, error. Independent reps (each re-extracts the
// series), so any one can be drilled cold.
const FORECAST_ROWS: DataRow[] = [
  { month: "Jan", sales: 100 },
  { month: "Feb", sales: 120 },
  { month: "Mar", sales: 140 },
  { month: "Apr", sales: 130 },
  { month: "May", sales: 160 },
  { month: "Jun", sales: 180 },
];

const FORECASTING: DrillContent = {
  scenario: {
    title: "Forecasting — reading and extending a series",
    role: "Six months of sales, trending up with a wobble. You'll measure the trend and project the next point.",
    goal: "Each cell is one time-series move on the same monthly `rows` — differences, growth, moving averages, simple forecasts, error. Independent reps; write each from memory. This is the toolkit behind any forecast.",
    outcome: "That's the forecasting starter kit — diffs, growth, moving average, drift, exponential smoothing, error. Fancier models layer onto exactly these ideas.",
    setupCode: pyRowsLiteral(FORECAST_ROWS),
    dataset: FORECAST_ROWS,
  },
  cumulative: false,
  cells: [
    { id: "series", task: "Create series — the sales values in order.", why: "Time-series work runs on the bare value sequence. Extract it before anything else.",
      focus: ["sales"], solution: `series = [r["sales"] for r in rows]`, assertions: `assert series == [100, 120, 140, 130, 160, 180]`,
      narrative: `A forecast operates on the ordered numbers, not the dicts. A comprehension pulls each month's sales into series, preserving the time order the rows are already in.`,
      steps: [
        { do: "Know the output — a list called series", code: `series = [ ]` },
        { do: "Pull each month's sales", code: `r["sales"] for r in rows` },
      ] },
    { id: "diffs", task: "Create diffs — the change from each month to the next.", why: "Period-over-period change is the first read on momentum. zip(s, s[1:]) pairs neighbours.",
      focus: ["sales"], solution: `s = [r["sales"] for r in rows]
diffs = [b - a for a, b in zip(s, s[1:])]`, assertions: `assert diffs == [20, 20, -10, 30, 20]`,
      narrative: `To compare each month with the one before, zip(s, s[1:]) pairs every value with its successor — s[1:] is the series shifted left by one. Subtracting a from b gives the step-by-step change.`,
      steps: [
        { do: "Extract the series", code: `s = [r["sales"] for r in rows]` },
        { do: "Pair each value with the next", code: `zip(s, s[1:])` },
        { do: "Subtract to get each change", code: `b - a` },
      ] },
    { id: "growth", task: "Create growth — each month's percentage change from the last, to 1dp.", why: "Growth rate normalises change by level. It's the diff over the previous value, as a percent.",
      focus: ["sales"], solution: `s = [r["sales"] for r in rows]
growth = [round((b - a) / a * 100, 1) for a, b in zip(s, s[1:])]`, assertions: `assert growth == [20.0, 16.7, -7.1, 23.1, 12.5]`,
      narrative: `A raw change of 20 means more off a base of 100 than off 200, so you divide the step by the previous value and scale to a percent. Same neighbour-pairing as diffs, expressed as relative growth.`,
      steps: [
        { do: "Pair each value with the next", code: `zip(s, s[1:])` },
        { do: "Change divided by the previous value", code: `(b - a) / a` },
        { do: "Scale to a percent and round", code: `* 100, 1` },
      ] },
    { id: "ma3", task: "Create ma3 — the 3-month trailing moving average.", why: "A moving average smooths the wobble to show the trend. Average a sliding window as it advances.",
      focus: ["sales"], solution: `s = [r["sales"] for r in rows]
ma3 = [sum(s[i-2:i+1]) / 3 for i in range(2, len(s))]`, assertions: `assert [round(v, 2) for v in ma3] == [120.0, 130.0, 143.33, 156.67]`,
      narrative: `Smoothing replaces each point with the average of it and its two neighbours. s[i-2:i+1] is the window of three ending at position i; dividing its sum by 3 is the average; range(2, len(s)) starts once a full window exists.`,
      steps: [
        { do: "Slide a window of the last three", code: `s[i-2:i+1]` },
        { do: "Average that window", code: `sum(...) / 3` },
        { do: "Advance once a full window exists", code: `for i in range(2, len(s))` },
      ] },
    { id: "naive", task: "Create naive — the naive forecast for next month (just the last value).", why: "The naive forecast is the baseline every model must beat: tomorrow equals today.",
      focus: ["sales"], solution: `s = [r["sales"] for r in rows]
naive = s[-1]`, assertions: `assert naive == 180`,
      narrative: `The simplest possible forecast assumes no change — next month equals this month. s[-1] grabs the last value, and that's your baseline to compare smarter methods against.`,
      steps: [
        { do: "Extract the series", code: `s = [r["sales"] for r in rows]` },
        { do: "Take the last value", code: `s[-1]` },
      ] },
    { id: "drift", task: "Create drift — next month by the drift method (last value plus average change).", why: "The drift method extends the overall trend line: add the mean step to the last point.",
      focus: ["sales"], solution: `s = [r["sales"] for r in rows]
drift = s[-1] + (s[-1] - s[0]) / (len(s) - 1)`, assertions: `assert drift == 196`,
      narrative: `Drift draws a line from the first point to the last and continues it. (s[-1] - s[0]) / (len(s) - 1) is the average change per step; adding one more step to the last value projects the trend forward.`,
      steps: [
        { do: "Average change per step", code: `(s[-1] - s[0]) / (len(s) - 1)` },
        { do: "Add one step to the last value", code: `s[-1] + ...` },
      ] },
    { id: "ma_next", task: "Create ma_next — a moving-average forecast: the mean of the last 3 months.", why: "Averaging the recent window is a common one-step forecast, steadier than the last point alone.",
      focus: ["sales"], solution: `s = [r["sales"] for r in rows]
ma_next = sum(s[-3:]) / 3`, assertions: `assert round(ma_next, 2) == 156.67`,
      narrative: `Rather than trust the single latest value, this forecasts next month as the average of the last three. s[-3:] is the trailing window; dividing its sum by 3 gives a smoother next-step estimate.`,
      steps: [
        { do: "Take the last three values", code: `s[-3:]` },
        { do: "Average them", code: `sum(...) / 3` },
      ] },
    { id: "level", task: "Create level — simple exponential smoothing with alpha = 0.5.", why: "Exponential smoothing weights recent points more, decaying the past. It's a running blend.",
      focus: ["sales"], solution: `s = [r["sales"] for r in rows]
level = s[0]
for v in s[1:]:
    level = 0.5 * v + 0.5 * level`, assertions: `assert round(level, 3) == 161.875`,
      narrative: `Exponential smoothing keeps a running level that leans toward each new point. Starting at the first value, every step blends half the new value with half the old level — so recent months weigh most, older ones fade.`,
      steps: [
        { do: "Start the level at the first value", code: `level = s[0]` },
        { do: "Walk the rest of the series", code: `for v in s[1:]` },
        { do: "Blend new value with old level", code: `level = 0.5 * v + 0.5 * level` },
      ] },
    { id: "mae", task: "Create mae — the mean absolute error of the naive one-step forecast.", why: "MAE scores a forecast: average how far off predicting \"same as last month\" would have been.",
      focus: ["sales"], solution: `s = [r["sales"] for r in rows]
mae = sum(abs(b - a) for a, b in zip(s, s[1:])) / (len(s) - 1)`, assertions: `assert mae == 20`,
      narrative: `If you'd predicted each month as the previous one, the error each time is |b - a|. abs() makes over- and under-shoots both count; averaging them over the steps gives the mean absolute error of that naive rule.`,
      steps: [
        { do: "Pair each value with the next", code: `zip(s, s[1:])` },
        { do: "Take the absolute miss each step", code: `abs(b - a)` },
        { do: "Average over the steps", code: `sum(...) / (len(s) - 1)` },
      ] },
    { id: "peak", task: "Create peak — the month with the highest sales.", why: "Spotting the peak period is a routine read. max() with a key, then the month off the winner.",
      focus: ["month", "sales"], solution: `peak = max(rows, key=lambda r: r["sales"])["month"]`, assertions: `assert peak == "Jun"`,
      narrative: `max(rows, key=...) returns the whole highest-selling row, judged by sales, and ["month"] reads its label — so peak names when the series topped out.`,
      steps: [
        { do: "Know the output — a month called peak", code: `peak =` },
        { do: "Judge each row by sales", code: `key=lambda r: r["sales"]` },
        { do: "Take the winner's month", code: `max(rows, ...)["month"]` },
      ] },
    { id: "cum", task: "Create cum — the cumulative (year-to-date) sales.", why: "A running total is the year-to-date line. Carry a total through the loop, appending each step.",
      focus: ["sales"], solution: `run = 0
cum = []
for r in rows:
    run += r["sales"]
    cum.append(run)`, assertions: `assert cum == [100, 220, 360, 490, 650, 830]`,
      narrative: `Year-to-date needs memory across months, so you keep a running total, add each month's sales to it, and record the total so far — cum climbs to the full-year sum.`,
      steps: [
        { do: "Start a running total and an empty list", code: `run = 0\ncum = []` },
        { do: "Scan month by month", code: `for r in rows` },
        { do: "Add this month's sales", code: `run += r["sales"]` },
        { do: "Record the total so far", code: `cum.append(run)` },
      ] },
  ],
};

const PYTHON_PACKS: DrillPack[] = [
  {
    id: "data-essentials",
    title: "Data essentials",
    blurb: "The everyday moves — filter, aggregate, group, sort. 14 quick reps.",
    tag: "Python",
    lang: "python",
    content: DATA_ESSENTIALS,
  },
  {
    id: "clean-shape",
    title: "Clean & shape data",
    blurb: "Tidy a messy table — strip, lowercase, cast types, dedupe, reshape.",
    tag: "Python",
    lang: "python",
    content: CLEAN_SHAPE,
  },
  {
    id: "explore",
    title: "Explore a dataset",
    blurb: "First-look profile — range, mean, median, group averages, ranking.",
    tag: "Python",
    lang: "python",
    content: EXPLORE_DATA,
  },
  {
    id: "build-chart",
    title: "Build a chart",
    blurb: "The data behind a visual — series, grouped totals, bins, scaling.",
    tag: "Python",
    lang: "python",
    content: BUILD_CHART,
  },
  {
    id: "linear-regression",
    title: "Linear regression",
    blurb: "Fit a line from scratch — means, slope, intercept, predict, R². Builds up.",
    tag: "Python",
    lang: "python",
    content: LINEAR_REGRESSION,
  },
  {
    id: "forecasting",
    title: "Forecasting",
    blurb: "Time-series moves — diffs, growth, moving average, smoothing, drift.",
    tag: "Python",
    lang: "python",
    content: FORECASTING,
  },
];

export const PACKS: DrillPack[] = [...PYTHON_PACKS, ...SQL_PACKS];

export function getPack(id: string): DrillPack | undefined {
  return PACKS.find(p => p.id === id);
}
