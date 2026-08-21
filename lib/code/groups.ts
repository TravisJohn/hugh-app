// ── Code pattern groups — the taxonomy behind the /code/start map ───────────
//
// The Code landing used to page through every pack one at a time. With 26
// Python packs that stopped being a picker and became a slideshow, so packs are
// now organised into a handful of territories: you pick a territory, it branches
// open, and its packs are the leaves.
//
// Membership is an EXPLICIT, ORDERED list of pack ids rather than something
// derived from `pack.tag`. Two reasons:
//   1. Tags don't carry it — nine packs share the tag "basics" but split across
//      two different groups here (language fundamentals vs. working with APIs).
//   2. Leaf order is authored. Within a group the packs read as a progression
//      (values before collections before control flow), which an incidental
//      ordering wouldn't preserve.
//
// This module is deliberately PURE DATA — no React, no lucide import — so it can
// be pulled into a server component (app/code/start/page.tsx computes heat from
// it) and unit-tested without a DOM. `icon` is a string key; the mapping to real
// components lives with the client component that renders it.
//
// Groups are language-agnostic: a group holds the pack ids for every language it
// covers, and the UI filters by the active language pill. Today "analysis" holds
// both Python and SQL packs, while "snowflake" is SQL-only — see groupsForLang
// below, which hides groups that are empty in the active language rather than
// rendering a dead cell.

import { PACKS } from "./packs";
import type { DrillLang } from "@/types/code";

/** Icon keys, resolved to components by the renderer (see components/code). */
export type GroupIconKey =
  | "braces"
  | "barChart"
  | "brain"
  | "sparkles"
  | "workflow"
  | "globe"
  | "snowflake";

export interface CodeGroup {
  /** Stable slug — used in UI state and, later, deep links. */
  id: string;
  /** Cell title. */
  label: string;
  /** One line under the title; says who this territory is for. */
  tagline: string;
  icon: GroupIconKey;
  /**
   * Accent hue as a raw hex value. Hex rather than a Tailwind class because the
   * branch connectors are SVG gradients, which need a real colour — the cell
   * chrome derives its tint from the same value.
   */
  accent: string;
  /** Pack ids in this group, in the order their leaves should read. */
  packIds: string[];
}

export const CODE_GROUPS: CodeGroup[] = [
  {
    id: "language-basics",
    label: "Language basics",
    tagline: "The Python you type before you type anything else.",
    icon: "braces",
    accent: "#38bdf8", // sky-400
    packIds: [
      "lets-do-this-values-types",
      "lets-do-this-collections",
      "lets-do-this-control-flow",
      "for-loop-constructs",
      "lets-do-this-functions",
      "lets-do-this-oop",
      "lets-do-this-files-envs-logging",
      "lets-do-this-exceptions-typing-status",
    ],
  },
  {
    id: "analysis",
    label: "For analysis",
    tagline: "Getting a dataset to answer a question.",
    icon: "barChart",
    accent: "#34d399", // emerald-400
    packIds: [
      "clean-shape",
      "explore",
      "build-chart",
      "linear-regression",
      "forecasting",
      // SQL — same territory, surfaced when the SQL pill is active.
      "sql-clean-shape",
      "sql-explore",
      "sql-build-chart",
      "sql-linear-regression",
      "sql-forecasting",
    ],
  },
  {
    id: "snowflake",
    label: "Snowflake",
    tagline: "The dialect, drilled — QUALIFY, IFF, MERGE, semi-structured.",
    icon: "snowflake",
    accent: "#7dd3fc", // sky-300
    packIds: [
      "snowflake-essentials",
      "snowflake-qualify",
      "snowflake-dates",
      "snowflake-semistructured",
      "snowflake-transform",
    ],
  },
  {
    id: "machine-learning",
    label: "Machine learning",
    tagline: "Fitting, validating, and reading real scikit-learn models.",
    icon: "brain",
    accent: "#a78bfa", // violet-400
    packIds: [
      "preprocessing",
      "validation",
      "logistic-regression",
      "decision-trees",
      "naive-bayes",
      "kmeans",
      "neural-network",
    ],
  },
  {
    id: "ai-retrieval",
    label: "AI & retrieval",
    tagline: "The moving parts behind a RAG pipeline, built by hand.",
    icon: "sparkles",
    accent: "#f472b6", // pink-400
    packIds: ["rag"],
  },
  {
    id: "automation",
    label: "For automation",
    tagline: "Scripts and pipelines that run without you watching.",
    icon: "workflow",
    accent: "#fbbf24", // amber-400
    packIds: ["automation", "automation-ii", "airflow"],
  },
  {
    id: "apis",
    label: "Working with APIs",
    tagline: "Calling services, and standing one up yourself.",
    icon: "globe",
    accent: "#22d3ee", // cyan-400
    packIds: ["lets-do-this-api-requests", "lets-do-this-api-routing"],
  },
];

/** Pack ids in `group` that exist in `lang`, in authored order. */
export function packIdsForLang(group: CodeGroup, lang: DrillLang): string[] {
  return group.packIds.filter(id => PACKS.some(p => p.id === id && p.lang === lang));
}

/**
 * Groups that have at least one pack in `lang`. A group with no packs in the
 * active language would otherwise render as a cell that branches into nothing.
 */
export function groupsForLang(lang: DrillLang): CodeGroup[] {
  return CODE_GROUPS.filter(g => packIdsForLang(g, lang).length > 0);
}

/** The group a pack belongs to, or undefined if it hasn't been filed yet. */
export function groupOfPack(packId: string): CodeGroup | undefined {
  return CODE_GROUPS.find(g => g.packIds.includes(packId));
}
