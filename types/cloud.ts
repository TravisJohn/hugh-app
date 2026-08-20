// ── Cloud Skills — shared types ─────────────────────────────────────────────
// A browsable, data/analytics-focused reference of cloud services across AWS,
// GCP and Azure. Content is static curated JSON (see lib/cloud/loader.ts) — the
// browsing experience has zero runtime AI cost. AI is used only for the scoped
// assistant on a service page (app/api/cloud/chat), grounded in that service's
// facts.

/** The three clouds covered in v1. */
export type CloudProvider = "aws" | "gcp" | "azure";

export const PROVIDERS: CloudProvider[] = ["aws", "gcp", "azure"];

export const PROVIDER_LABELS: Record<CloudProvider, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
};

/**
 * The canonical logical grouping a service belongs to — this drives the filter
 * on the landing page. A service can sit in more than one group (e.g. Azure Data
 * Factory is both integration and orchestration).
 */
export const LOGICAL_GROUPS = [
  "storage",
  "relational",
  "nosql",
  "cache",
  "warehouse",
  "olap",
  "integration",
  "movement",
  "streaming",
  "messaging",
  "compute",
  "serverless",
  "orchestration",
  "ml",
  "bi",
  "governance",
] as const;

export type LogicalGroup = (typeof LOGICAL_GROUPS)[number];

/** Human labels for the group filter pills, in display order. */
export const GROUP_LABELS: Record<LogicalGroup, string> = {
  storage: "Storage & Lake",
  relational: "Relational & OLTP",
  nosql: "NoSQL Databases",
  cache: "In-Memory Cache",
  warehouse: "Warehouse & Query",
  olap: "Real-time & Time-series",
  integration: "ETL & Integration",
  movement: "Migration & Transfer",
  streaming: "Streaming",
  messaging: "Messaging & Queues",
  compute: "Big-Data Compute",
  serverless: "Serverless Functions",
  orchestration: "Orchestration",
  ml: "ML Platform",
  bi: "BI & Visualization",
  governance: "Governance & Catalog",
};

/**
 * A service's place in an end-to-end data pipeline — drives the "Pipeline map"
 * holistic view, which lays every service out by the stage it plays. A service
 * can span more than one stage (e.g. Azure Data Factory both processes and
 * orchestrates).
 */
export const STAGES = [
  "ingest",
  "store",
  "process",
  "orchestrate",
  "serve",
  "govern",
] as const;

export type Stage = (typeof STAGES)[number];

/** Labels + one-line descriptions for each pipeline stage, in flow order. */
export const STAGE_META: Record<Stage, { label: string; blurb: string }> = {
  ingest: { label: "Ingest", blurb: "Get data in — streams, events, CDC, transfer" },
  store: { label: "Store", blurb: "Where data lives — lakes, databases, caches" },
  process: { label: "Process", blurb: "Transform & compute — ETL, Spark, functions" },
  orchestrate: { label: "Orchestrate", blurb: "Schedule & coordinate the pipeline" },
  serve: { label: "Serve", blurb: "Analyse & deliver — warehouses, BI, ML" },
  govern: { label: "Govern", blurb: "Catalog, secure & track the data" },
};

/** A cross-cloud equivalent, linked from a service's detail page. */
export interface Equivalent {
  provider: CloudProvider;
  id: string;
  name: string;
  /** Short note on how the mapping differs, if at all. */
  note?: string;
}

/**
 * Where a claim was checked, and what the source actually said.
 *
 * The quote is stored, not just the URL. A bare link asks the reader to go and
 * re-derive the finding; a quote lets them see in one glance whether the source
 * really says what the fact claims. It is also what makes a later re-check
 * cheap — you can tell whether the DOCS changed or the write-up drifted.
 */
export interface FactSource {
  /** The exact page the claim was verified against — not a hub or landing page. */
  url: string;
  /** Verbatim from that page. Never paraphrased. */
  quote: string;
  /** YYYY-MM-DD the check was made. */
  checked: string;
}

/** A labelled key fact — used for the limits / pricing-shape table. */
export interface Fact {
  label: string;
  value: string;
  /** Present only where the claim has actually been checked against a source. */
  source?: FactSource;
}

/** One core concept the learner should know for this service. */
export interface Concept {
  term: string;
  detail: string;
}

/**
 * A practical "where does this fit" picture. Deliberately illustrative, not
 * exhaustive — the point is to paint how the service is commonly used, not to be
 * accurate to the last detail.
 */
export interface InPractice {
  /** A plain-language sketch of a common real-world use. */
  narrative: string;
  /** A typical pipeline as ordered stages, e.g. ["App logs", "S3", "Glue", …]. */
  flow?: string[];
  /** Index into `flow` that IS this service, so the diagram can highlight it. */
  highlight?: number;
}

/**
 * When this write-up was produced and when it was last checked.
 *
 * Deliberately records dates and nothing derived. Whether a service counts as
 * "stale" is computed at read time from `verified` (see lib/cloud/provenance.ts)
 * — a stored status would itself go out of date, which is the exact failure this
 * whole layer exists to fix.
 *
 * Optional on purpose: a service with no `meta` reads as UNVERIFIED, never as
 * fine. Same stance as an unknown model falling back to the most expensive rate
 * in lib/pricing.ts — an unknown must never be quietly flattering.
 */
export interface ServiceMeta {
  /** When the write-up was authored, YYYY-MM or YYYY-MM-DD. */
  authored?: string;
  /** Last verification pass, YYYY-MM-DD. Absent means never checked. */
  verified?: string;
  /** How that pass was done — "manual" (a human with the docs) or "pipeline". */
  method?: "manual" | "pipeline";
  /** Anything a reviewer needs the next reviewer to know. */
  note?: string;
}

/** A full service write-up — "everything you need to know" for one service. */
export interface Service {
  /** Provenance. Absent = never verified; see lib/cloud/provenance.ts. */
  meta?: ServiceMeta;
  id: string;
  provider: CloudProvider;
  /** Product name, e.g. "Amazon S3". */
  name: string;
  /** Expanded / former name, e.g. "Simple Storage Service". */
  short?: string;
  groups: LogicalGroup[];
  oneLiner: string;
  /** What it is — a plain-language paragraph. */
  whatItIs: string;
  /** Where it fits in a real stack — illustrative, not exhaustive. */
  inPractice?: InPractice;
  coreConcepts: Concept[];
  whenToUse: string[];
  whenNotToUse: string[];
  /** Hard limits and shape-of-the-service numbers worth knowing. */
  keyFacts: Fact[];
  /** How you pay — the pricing model in prose (not live prices). */
  pricingShape: string;
  gotchas: string[];
  equivalents: Equivalent[];
  docsUrl?: string;
}

/** Lightweight index entry — never carries the full write-up. */
export interface ServiceStub {
  id: string;
  provider: CloudProvider;
  name: string;
  short?: string;
  groups: LogicalGroup[];
  /** Pipeline stage(s) this service plays — drives the Pipeline map view. */
  stages: Stage[];
  oneLiner: string;
}

/** The manifest — the whole catalog's lightweight index. */
export interface CloudManifest {
  version: string;
  services: ServiceStub[];
}
