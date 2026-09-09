// ── Learning regions ─────────────────────────────────────────────────────────
//
// The handful of areas a learner's work is filed under. Three things depend on
// this list agreeing with itself, which is why it lives on its own rather than
// inside whichever feature happened to need it first:
//
//   the topic gate   — files each new goal into one of these
//   the constellation — draws one cluster per region, lit by progress
//   progress          — counts mastered milestones per region
//
// It is a FIXED list, not learner-authored. These are regions of a picture: a
// learner inventing their own would leave a cluster with one point in it, and
// a goal filed under a region nobody else shares can never light anything.
//
// Adding one is a code change and a deliberate act — every existing goal keeps
// the region it was filed under, and the new one simply starts dark.

export interface LearningRegion {
  id:    string;
  label: string;
  /** CSS colour, used directly in SVG fills and strokes. */
  color: string;
  /**
   * Concepts belonging to this region, surfaced a few at a time in the
   * constellation. Concepts rather than products, for the same reason the gate
   * stopped promising tool tutorials — see CLAUDE.md, "What Learn teaches".
   */
  concepts: readonly string[];
}

export const LEARNING_REGIONS: readonly LearningRegion[] = [
  {
    id: "ml", label: "Machine Learning", color: "#f472b6",
    concepts: [
      "Feature thinking", "Model evaluation", "Overfitting", "Bias & variance",
      "Cross-validation", "Embeddings", "Retrieval", "Drift",
    ],
  },
  {
    id: "stats", label: "Statistics", color: "#a78bfa",
    concepts: [
      "Probability", "Statistical inference", "Confidence intervals", "Sampling",
      "Experiment design", "Causal inference", "Confounding", "Effect size",
    ],
  },
  {
    id: "engineering", label: "Data Engineering", color: "#38bdf8",
    concepts: [
      "Pipeline design", "Idempotency", "Backfills", "Dimensional modelling",
      "Partitioning", "Schema evolution", "Lineage", "Data contracts",
    ],
  },
  {
    id: "cloud", label: "Cloud", color: "#22d3ee",
    concepts: [
      "Warehouses & lakehouses", "Storage tiers", "Cost of a query", "Managed services",
      "Distributed processing", "Shuffles", "Scaling models", "Isolation",
    ],
  },
  {
    id: "automation", label: "Automation", color: "#fb923c",
    concepts: [
      "Orchestration", "Scheduling", "Retries & failure modes", "Alerting",
      "Reproducibility", "Testing data", "Deployment patterns", "Observability",
    ],
  },
  {
    id: "analytics", label: "Analytics", color: "#34d399",
    concepts: [
      "Framing the question", "Designing for decisions", "Choosing the chart",
      "Narrative with data", "Explaining uncertainty", "Cohorts", "Segmentation",
      "Metrics that move",
    ],
  },
];

/** What sits at the centre of all of them. */
export const CORE_LABEL = "Data";

const REGION_IDS: ReadonlySet<string> = new Set(LEARNING_REGIONS.map(r => r.id));

/**
 * Whether a value names a real region.
 *
 * The gate's region arrives from a language model, so it is guessed text until
 * something checks it. An unrecognised value is dropped rather than stored: a
 * goal with no region simply lights nothing, which is a far smaller harm than a
 * column quietly filling with invented names that no cluster will ever match.
 */
export function isRegionId(value: unknown): value is string {
  return typeof value === "string" && REGION_IDS.has(value);
}

/** The ids, in display order — for prompts, and for iterating progress. */
export function regionIds(): string[] {
  return LEARNING_REGIONS.map(r => r.id);
}
