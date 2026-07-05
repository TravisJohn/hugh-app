// ── The Case Room — shared types ────────────────────────────────────────────
// A "case" is a fixed sequence of high-level decisions with baked-in
// consequences. Different choices surface different consequences and set flags,
// but all paths reconverge — the ending is COMPUTED as a diff against one gold
// path, not pre-written. There is no code/free-text step: every decision is a
// multiple-choice call, so the whole experience is deterministic (zero runtime
// AI cost). AI is used only offline, to author cases.

/** Whether a chosen option reflects strong or weak analytical judgment. */
export type Flag = "strong" | "weak";

/** The three orthogonal analyst "muscles" a case scores. */
export type FlagKey = "framing_quality" | "metric_validity" | "causal_caution";

/** A placeholder chart/table revealed in a situation or consequence. Real
 *  charts come later; these render as simple bar/table blocks. */
export type Artifact =
  | {
      type: "bars";
      title: string;
      /** Set when the values are percentages (renders a trailing %). */
      unit?: "%";
      bars: { label: string; value: number; highlight?: boolean }[];
      caption?: string;
    }
  | {
      type: "table";
      title: string;
      headers: string[];
      rows: string[][];
    };

/** One choice within a decision. */
export interface CaseOption {
  id: string; // "A".."D"
  label: string;
  detail: string;
  flag: Flag;
  /** What choosing this surfaces — shown after the learner commits. */
  consequence: string;
  /** Pulled into the final reveal for a divergence. Empty for the gold option. */
  divergenceCost: string;
  /** Optional artifact revealed alongside this option's consequence. */
  artifact?: Artifact;
}

/** A single decision point on the reconverging spine. */
export interface Decision {
  id: string; // e.g. "framing" | "evidence" | "interpretation"
  flag: FlagKey;
  prompt: string;
  /** Optional artifact shown with the prompt (before the learner commits). */
  artifact?: Artifact;
  options: CaseOption[];
  /** The expert-baseline option id for this decision. */
  gold: string;
}

export interface CaseScenario {
  role: string;
  company: string;
  situation: string;
  stakeholderBelief: string;
  question: string;
}

/** A full, playable case. */
export interface Case {
  id: string;
  title: string;
  scenario: CaseScenario;
  decisions: Decision[];
  /** decisionId → gold optionId (mirrors each decision's `gold`). */
  goldPath: Record<string, string>;
  /** The planted insight, revealed at the very end. */
  insight: string;
}

export type Difficulty = "intro" | "core" | "hard";

/** The filterable dimensions of a case. `about`/`industry` are single;
 *  `modelling`/`statistics` can carry more than one value. `stack` is the
 *  cloud/tooling dimension — OPTIONAL: only the data-engineering architecture
 *  cases populate it, so analytics cases omit it entirely. */
export interface CaseFacets {
  about: string;
  industry: string;
  modelling: string[];
  statistics: string[];
  stack?: string[];
}

/** The keys of {@link CaseFacets}, in display order — drives the filter panel. */
export const FACET_KEYS = ["about", "industry", "modelling", "statistics", "stack"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export const FACET_LABELS: Record<FacetKey, string> = {
  about: "About",
  industry: "Industry",
  modelling: "Modelling use",
  statistics: "Statistics",
  stack: "Cloud / stack",
};

/** Lightweight stub for the library index — never carries full case content. */
export interface CaseStub {
  id: string;
  title: string;
  company: string;
  difficulty: Difficulty;
  domain: string;
  estMinutes: number;
  facets: CaseFacets;
}

/** The manifest for the active batch (the monthly rotation lives here later). */
export interface Manifest {
  batch: string; // e.g. "2026-07"
  cases: CaseStub[];
}

// ── Progress (persisted per learner) ─────────────────────────────────────────

/** One completed play of a case. */
export interface Attempt {
  caseId: string;
  /** decisionId → chosen optionId. */
  choices: Record<string, string>;
  /** flagKey → strong/weak, as set by the chosen options. */
  flags: Partial<Record<FlagKey, Flag>>;
  /** How many of the three muscles held (0–3). */
  heldCount: number;
  completedAt: string;
}

/** A learner's rolled-up progress for one case (for the library badges). */
export interface CaseProgress {
  completed: boolean;
  /** Best muscles-held across attempts (0–3). */
  bestHeld: number;
  attempts: number;
}
