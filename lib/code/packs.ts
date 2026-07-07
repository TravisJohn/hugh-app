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

import type { DrillContent } from "./drillContent";

export interface DrillPack {
  id: string;        // URL slug: /code/drill?pack=<id>
  title: string;     // card title
  blurb: string;     // one-line card description
  tag: string;       // small pill, e.g. "Python"
  content: DrillContent;
}

const DATA_ESSENTIALS: DrillContent = {
  scenario: {
    title: "Data essentials — the everyday moves",
    role: "Fast reps on the operations you reach for constantly. Not a puzzle — just the constructs, from memory.",
    goal: "Each cell is one small, standard move on the same `rows`. They're independent — write each from memory. The point is fluency: repeat until the syntax is automatic.",
    outcome: "That's the core toolkit — filter, aggregate, group, sort. Run it again from memory to lock it in.",
    setupCode: `rows = [
    {"name": "Ann",  "team": "A", "sales": 30, "region": "EU"},
    {"name": "Ben",  "team": "B", "sales": 50, "region": "NA"},
    {"name": "Cara", "team": "A", "sales": 20, "region": "EU"},
    {"name": "Dan",  "team": "B", "sales": 70, "region": "APAC"},
    {"name": "Eve",  "team": "A", "sales": 20, "region": "NA"},
    {"name": "Finn", "team": "B", "sales": 50, "region": "EU"},
]`,
  },
  cumulative: false,
  cells: [
    { id: "total", task: "Create total — the sum of every row's sales.", why: "Summing a column is the most basic aggregate. A generator expression inside sum() is the pattern.",
      solution: `total = sum(r["sales"] for r in rows)`, assertions: `assert total == 240` },
    { id: "n", task: "Create n — how many rows there are.", why: "len() on the list. Trivial, but it's the reflex you want automatic.",
      solution: `n = len(rows)`, assertions: `assert n == 6` },
    { id: "eu", task: `Create eu — only the rows where region is "EU".`, why: "Filtering to a slice with a list comprehension + condition — the move you make constantly.",
      solution: `eu = [r for r in rows if r["region"] == "EU"]`, assertions: `assert len(eu) == 3 and all(r["region"] == "EU" for r in eu)` },
    { id: "names", task: "Create names — a list of just the name field from every row.", why: "Projecting one field out of each row: a list comprehension that maps, not filters.",
      solution: `names = [r["name"] for r in rows]`, assertions: `assert names == ["Ann", "Ben", "Cara", "Dan", "Eve", "Finn"]` },
    { id: "big", task: "Create big — the rows where sales is 50 or more.", why: "Same filter shape, numeric threshold. Muscle memory for the comparison-in-comprehension.",
      solution: `big = [r for r in rows if r["sales"] >= 50]`, assertions: `assert len(big) == 3` },
    { id: "avg", task: "Create avg — the mean of sales across all rows.", why: "Sum divided by count. The everyday average, no library needed.",
      solution: `avg = sum(r["sales"] for r in rows) / len(rows)`, assertions: `assert avg == 40` },
    { id: "top", task: "Create top — the single row with the highest sales.", why: "max() with a key function picks the winning record — a pattern you'll reuse forever.",
      solution: `top = max(rows, key=lambda r: r["sales"])`, assertions: `assert top["name"] == "Dan"` },
    { id: "by_team", task: "Create by_team — a dict mapping each team to its total sales.", why: "Group-by-and-sum, hand-rolled: dict.get(key, 0) is the accumulator idiom behind every groupby.",
      solution: `by_team = {}
for r in rows:
    by_team[r["team"]] = by_team.get(r["team"], 0) + r["sales"]`, assertions: `assert by_team == {"A": 70, "B": 170}` },
    { id: "counts", task: "Create counts — a dict mapping each team to how many rows it has.", why: "Same accumulator, counting instead of summing (+ 1). The count-by-key reflex.",
      solution: `counts = {}
for r in rows:
    counts[r["team"]] = counts.get(r["team"], 0) + 1`, assertions: `assert counts == {"A": 3, "B": 3}` },
    { id: "regions", task: "Create regions — the distinct regions, sorted alphabetically.", why: "set() to dedupe, sorted() to order. The two-step you reach for to list unique values.",
      solution: `regions = sorted(set(r["region"] for r in rows))`, assertions: `assert regions == ["APAC", "EU", "NA"]` },
    { id: "ranked", task: "Create ranked — the rows sorted by sales, highest first.", why: "sorted() with key= and reverse=True. Ordering records is a daily move.",
      solution: `ranked = sorted(rows, key=lambda r: r["sales"], reverse=True)`, assertions: `assert [r["name"] for r in ranked[:2]] == ["Dan", "Ben"]` },
    { id: "eu_total", task: `Create eu_total — total sales for the "EU" region only.`, why: "Filter and aggregate in one pass: a condition inside the sum generator.",
      solution: `eu_total = sum(r["sales"] for r in rows if r["region"] == "EU")`, assertions: `assert eu_total == 100` },
    { id: "top_names", task: "Create top_names — a set of names whose sales are 50 or more.", why: "A set comprehension: build a deduped collection with a condition in one line.",
      solution: `top_names = {r["name"] for r in rows if r["sales"] >= 50}`, assertions: `assert top_names == {"Ben", "Dan", "Finn"}` },
    { id: "teams", task: "Create teams — how many distinct teams appear.", why: "len(set(...)) — count unique values in one expression. A tidy, common one-liner.",
      solution: `teams = len(set(r["team"] for r in rows))`, assertions: `assert teams == 2` },
  ],
};

export const PACKS: DrillPack[] = [
  {
    id: "data-essentials",
    title: "Data essentials",
    blurb: "The everyday moves — filter, aggregate, group, sort. 14 quick reps.",
    tag: "Python",
    content: DATA_ESSENTIALS,
  },
];

export function getPack(id: string): DrillPack | undefined {
  return PACKS.find(p => p.id === id);
}
