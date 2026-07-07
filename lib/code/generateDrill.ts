// Prompt construction + response parsing for on-demand drill generation.
// Pure and framework-free so it can be unit-tested without the network; the
// route (app/api/code/generate-drill) owns the actual Anthropic call.
//
// The generated drill MUST run in the base Pyodide worker (no pandas/numpy),
// so every solution and assertion is pure-Python stdlib over a list-of-dicts
// dataset named `rows`. That constraint is baked into the prompt.

import { createHash } from "node:crypto";
import type { DrillCell, DrillContent, Scenario } from "./drillContent";

export interface DrillRequest {
  topic: string;      // what to practise, e.g. "Airflow Core Concepts"
  context?: string;   // where it came from, e.g. "Building Airflow DAGs (track)"
  focus?: string;     // optional lean, e.g. "Aggregating / grouping"
}

// Bump when the prompt/output shape changes meaningfully — the cache key folds
// this in, so old cached drills are naturally superseded rather than served stale.
export const DRILL_PROMPT_VERSION = "1";

// Stable key for the code_drills cache. Drills are generic (keyed by what you're
// practising, not who you are), so the same topic is shared across users and
// revisits — and getting the same drill back is a feature for muscle memory.
export function drillCacheKey(req: DrillRequest): string {
  const norm = (s?: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  // JSON.stringify keeps field boundaries unambiguous (no delimiter char needed).
  const basis = JSON.stringify([DRILL_PROMPT_VERSION, norm(req.topic), norm(req.context), norm(req.focus)]);
  return createHash("sha256").update(basis).digest("hex");
}

const MIN_CELLS = 3;
const MAX_CELLS = 5;

export const DRILL_SYSTEM = `You design short "notebook drills" that build coding muscle memory: a learner retypes 3–5 tiny Python cells from memory, each checked by hidden asserts.

Hard rules — the drill runs in base Pyodide (no pip, no pandas/numpy):
- Pure Python standard library ONLY. Allowed imports: math, statistics, collections, itertools, functools, re, datetime. NEVER pandas, numpy, or any third-party package.
- The setup defines the dataset(s) as literal list(s) of dicts (4–8 rows each) with consistent keys. Name a single table \`rows\`; for topics that genuinely need two tables (joins/merges), use clear names like \`orders\` and \`customers\`. No I/O, no randomness, no network.
- Each cell's \`solution\` is 1–3 lines that create ONE new variable from the setup data (or from a variable an earlier cell created — cells run in order, state carries).
- Each cell's \`assertions\` is one or more \`assert\` statements on that variable, with concrete expected values that the solution provably produces. Deterministic. No asserts on printed output.
- Cells build toward the scenario's outcome, from raw data to an answer.

Translate the requested topic into a concrete, runnable pure-Python exercise that captures its ESSENCE. If the topic isn't directly Python (a tool, a concept, a framework like Airflow or SQL), model it with plain Python data structures (e.g. a DAG as a dict of dependencies; a table as a list of dicts) — teach the underlying reasoning pattern.

Respond with ONLY a JSON object, no markdown fences, no prose. Shape:
{
  "scenario": { "title": string, "role": string, "goal": string, "outcome": string, "setupCode": string },
  "cells": [ { "task": string, "why": string, "solution": string, "assertions": string } ]  // ${MIN_CELLS}–${MAX_CELLS} items
}
- title: a short, concrete framing question. role: one sentence of who the learner is. goal: 2–3 sentences on the through-line. outcome: one sentence stating the final answer with the actual numbers.
- task: plain-language "create X — …". why: one or two sentences on why the move matters. Keep everything tight.`;

export function buildDrillPrompt(req: DrillRequest): string {
  const lines = [`Topic to practise: ${req.topic.trim()}`];
  if (req.context?.trim()) lines.push(`Where it comes from: ${req.context.trim()}`);
  if (req.focus?.trim())   lines.push(`Lean the drill toward: ${req.focus.trim()}`);
  lines.push(`\nDesign a ${MIN_CELLS}–${MAX_CELLS}-cell notebook drill for this. Return only the JSON object.`);
  return lines.join("\n");
}

class DrillParseError extends Error {}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") throw new DrillParseError(`missing/invalid ${field}`);
  return v;
}

/**
 * Parse + validate the model's JSON into a DrillContent. Throws DrillParseError
 * on any shape problem so the caller can fall back to the sample. Cell ids are
 * assigned here (c0…cn) so React keys / glow tracking are always unique
 * regardless of what the model returned.
 */
export function parseDrill(raw: string): DrillContent {
  // Tolerate accidental ```json fences or leading prose before the object.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new DrillParseError("no JSON object found");

  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new DrillParseError("invalid JSON");
  }

  const root = obj as { scenario?: unknown; cells?: unknown };
  const s = root.scenario as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") throw new DrillParseError("missing scenario");

  const scenario: Scenario = {
    title: str(s.title, "scenario.title"),
    role: str(s.role, "scenario.role"),
    goal: str(s.goal, "scenario.goal"),
    outcome: str(s.outcome, "scenario.outcome"),
    setupCode: str(s.setupCode, "scenario.setupCode"),
  };
  if (!/=/.test(scenario.setupCode)) throw new DrillParseError("setupCode must define a dataset");

  if (!Array.isArray(root.cells)) throw new DrillParseError("cells must be an array");
  if (root.cells.length < MIN_CELLS || root.cells.length > MAX_CELLS) {
    throw new DrillParseError(`expected ${MIN_CELLS}-${MAX_CELLS} cells, got ${root.cells.length}`);
  }

  const cells: DrillCell[] = root.cells.map((c, i) => {
    const cell = c as Record<string, unknown>;
    return {
      id: `c${i}`,
      task: str(cell.task, `cells[${i}].task`),
      why: str(cell.why, `cells[${i}].why`),
      solution: str(cell.solution, `cells[${i}].solution`),
      assertions: str(cell.assertions, `cells[${i}].assertions`),
    };
  });

  return { scenario, cells };
}

export { DrillParseError };
