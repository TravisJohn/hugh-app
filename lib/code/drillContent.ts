// ── Notebook-drill content ───────────────────────────────────────────────────
// A tiny pure-Python "dataset" (list of dicts) stands in for a dataframe so the
// drill needs no pandas load and reuses the existing Pyodide worker untouched.
// Cells build on each other (state carries, Jupyter-style); each is checked by
// hidden asserts on a RESULT variable — any correct phrasing passes.
//
// SAMPLE_DRILL below is the fixed fallback. Real drills are produced on demand by
// /api/code/generate-drill from the learning/topic the user picked; both share
// the DrillContent shape so DrillMock renders either identically.

export interface DrillCell {
  id: string;
  task: string;        // what to produce, in plain language
  why: string;         // the essence — why this step matters
  solution: string;    // reference — the answer to replicate
  assertions: string;  // hidden asserts on the produced variable
}

export interface Scenario {
  title: string;
  role: string;
  goal: string;
  outcome: string;
  setupCode: string;   // read-only setup; must define `rows` (a list of dicts)
}

export interface DrillContent {
  scenario: Scenario;
  cells: DrillCell[];
}

/**
 * The speed-meter budget for a cell, derived from how much code it takes — a
 * rough "time to type it" so longer answers get proportionally longer. Clamped
 * to a sane range.
 */
export function timerSecondsFor(cell: DrillCell): number {
  return Math.max(22, Math.min(110, Math.round(16 + cell.solution.length / 1.8)));
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
