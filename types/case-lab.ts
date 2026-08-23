// ── The Case Lab — shared types ─────────────────────────────────────────────
// Long-form "takeaway" cases: a real business problem + a synthetic dataset the
// learner downloads and works in their own tools / their favourite AI, then
// compares against an expert teaching note. Fully static, ZERO runtime AI —
// every field below is authored offline and shipped as a public JSON file.

/** One column in the dataset, described for the learner. */
export interface CaseLabColumn {
  name: string;
  type: "int" | "float" | "string" | "date";
  description: string;
}

/** The filterable dimensions of a Case Lab case, mirroring the Case Room's facet
 *  model but tighter: `topic` is the single domain the dataset is about, `skill`
 *  is the analytical lesson(s) planted in it (a normalized, filterable form of the
 *  headline `trap` string — a case may carry more than one). */
export interface CaseLabFacets {
  topic: string;
  skill: string[];
}

/** The keys of {@link CaseLabFacets}, in display order — drives the filter panel. */
export const FACET_KEYS = ["topic", "skill"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export const FACET_LABELS: Record<FacetKey, string> = {
  topic: "Topic",
  skill: "Skill",
};

/** The business framing shown at the top of a case. */
export interface CaseLabScenario {
  role: string;            // who the learner is playing
  company: string;
  situation: string;       // the setup
  stakeholderBelief: string; // the confident (usually wrong) claim to test
  question: string;        // the decision the learner must reach
}

/** The expert worked solution, revealed on demand (the payoff). */
export interface CaseLabTeachingNote {
  naiveRead: string;                 // what the obvious analysis concludes
  theTrap: string;                   // the structure planted in the data
  honestAnswer: string;              // the defensible conclusion
  howToGetThere: string[];           // the method, step by step
  numbers: { label: string; value: string }[]; // the key figures
  lesson: string;                    // the transferable principle
}

/** ── The worked notebook (optional, per case) ────────────────────────────────
 * A case may ship a runnable walkthrough: an ordered list of cells, each one
 * explanation + Python. It runs entirely in the browser (Pyodide) against the
 * case's own CSV, which is pre-bound as `df` — so the learner never downloads,
 * uploads, or wires up anything to start analysing.
 *
 * The cells are authored from `suggestedApproach` (the METHOD), never from
 * `teachingNote.howToGetThere` (the method WITH the answer). The numbers appear
 * from running the learner's own data, not from a spoiler paragraph — and the
 * whole notebook sits behind a disclosure, like the teaching note, so anyone
 * who wants to attempt the case cold simply doesn't open it.
 *
 * ZERO runtime AI, zero server cost: Pyodide is a CDN download, the CSV is a
 * static asset, and nothing leaves the browser.
 */
export interface CaseLabNotebookCell {
  /** Short step label, e.g. "Reproduce the headline". */
  title: string;
  /** Why this step exists, in plain language. Rendered above the code. */
  explain: string;
  /** Runnable Python. `df`, `pd` and `np` are already in scope. */
  code: string;
  /** Optional "what to look for" hint, shown only AFTER the cell has run. */
  reads?: string;
}

export interface CaseLabNotebook {
  /** One-line framing shown when the notebook is expanded. */
  intro: string;
  cells: CaseLabNotebookCell[];
}

/** A full, playable long-form case. */
export interface CaseLabCase {
  id: string;
  title: string;
  trap: string;                      // e.g. "Confounding / selection bias"
  facets: CaseLabFacets;             // topic + normalized skill(s) — filterable
  estMinutes: number;
  scenario: CaseLabScenario;
  dataset: {
    file: string;                    // public path to the CSV, e.g. /case-lab/<id>/data.csv
    rows: number;
    columns: CaseLabColumn[];
    sample: Record<string, string | number>[]; // first ~10 rows for a static preview
  };
  guidingQuestions: string[];        // prompts to think about — NOT graded
  suggestedApproach?: string[];      // optional non-spoiling method scaffold — how to go about it
  notebook?: CaseLabNotebook;        // optional runnable walkthrough — see above
  teachingNote: CaseLabTeachingNote;
}

/** Lightweight stub for the feed index — never carries the full case. */
export interface CaseLabStub {
  id: string;
  title: string;
  company: string;
  trap: string;
  facets: CaseLabFacets;             // topic + normalized skill(s) — filterable
  estMinutes: number;
  rows: number;
  releaseDate: string;               // ISO date — drives the dated feed order
  blurb: string;
}

/** The manifest for the active batch. */
export interface CaseLabManifest {
  batch: string;                     // e.g. "2026-07"
  cases: CaseLabStub[];
}
