// ── Throwaway UX spike content — one narrow "notebook drill" ─────────────────
// A tiny pure-Python "dataset" (list of dicts) stands in for a dataframe so the
// mock needs no pandas load and reuses the existing Pyodide worker untouched.
// The real Code pillar can swap this for actual pandas. Cells build on each
// other (state carries, Jupyter-style); each is checked by hidden asserts on the
// RESULT variable — any correct phrasing passes.

export interface DrillCell {
  id: string;
  instruction: string; // always-visible prompt, written as a Python comment
  solution: string;    // reference — also the pass-1 scaffold (shown commented)
  assertions: string;  // hidden asserts on the produced variable
  timerSeconds: number;
}

export const SCENARIO = {
  title: "Mini sales table",
  blurb:
    "A small list of order rows is already loaded as `rows`. Work through the cells top-to-bottom — each builds on the last.",
  // Read-only setup cell (the "scenario"). Runs before every check.
  setupCode: `rows = [
    {"region": "EU",   "product": "A", "units": 3, "price": 10},
    {"region": "NA",   "product": "B", "units": 5, "price": 8},
    {"region": "EU",   "product": "B", "units": 2, "price": 8},
    {"region": "APAC", "product": "A", "units": 7, "price": 10},
    {"region": "NA",   "product": "A", "units": 1, "price": 10},
    {"region": "EU",   "product": "A", "units": 4, "price": 10},
]`,
};

export const DRILL_CELLS: DrillCell[] = [
  {
    id: "eu",
    instruction: "# eu: the rows where region == 'EU' (a list)",
    solution: `eu = [r for r in rows if r["region"] == "EU"]`,
    assertions:
      `assert isinstance(eu, list) and len(eu) == 3 and all(r["region"] == "EU" for r in eu)`,
    timerSeconds: 20,
  },
  {
    id: "revenue",
    instruction: "# revenue: total units * price across ALL rows",
    solution: `revenue = sum(r["units"] * r["price"] for r in rows)`,
    assertions: `assert revenue == 206`,
    timerSeconds: 25,
  },
  {
    id: "by_region",
    instruction: "# by_region: a dict of region -> total units",
    solution: `by_region = {}
for r in rows:
    by_region[r["region"]] = by_region.get(r["region"], 0) + r["units"]`,
    assertions: `assert by_region == {"EU": 9, "NA": 6, "APAC": 7}`,
    timerSeconds: 35,
  },
  {
    id: "top",
    instruction: "# top: the region with the most total units (use by_region)",
    solution: `top = max(by_region, key=by_region.get)`,
    assertions: `assert top == "EU"`,
    timerSeconds: 25,
  },
];
