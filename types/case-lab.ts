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
