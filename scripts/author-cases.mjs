// ── The Case Room — offline case authoring pipeline ─────────────────────────
// generate (Sonnet) → deterministic schema check → critic (Sonnet, rubric) →
// revise loop → write. The HUMAN provides the pedagogical skeleton (each brief's
// belief-vs-real-driver + lesson — the judgment); the model does the mechanical
// drafting; the critic + validator raise the hit rate; you review the output.
//
//   node scripts/author-cases.mjs            → author every brief not yet written
//   node scripts/author-cases.mjs --force    → re-author even if a file exists
//   node scripts/author-cases.mjs --only=id  → just one brief
//
// Needs ANTHROPIC_API_KEY in .env.local. Writes public/case-data/<id>.json and
// rebuilds public/case-data/manifest.json (churn + all authored cases).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "case-data");
const MODEL = "claude-sonnet-4-6"; // repo convention; reasoning-heavy generation
const FORCE = process.argv.includes("--force");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1];

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  const raw = readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}
const env = loadEnv();
if (!env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ── The gold-standard example (the hand-authored churn case) ─────────────────
const CHURN = readFileSync(path.join(DATA_DIR, "freshbox-churn.json"), "utf8");

// ── The 9 briefs — each a planted insight the model must build a case toward ──
// belief = the plausible-but-wrong stakeholder hypothesis (the red herring).
// realDriver = the actual cause the segmentation/normalized metric reveals.
// lesson = the transferable analytical principle.
const BRIEFS = [
  {
    id: "retail-promo-lift", title: "The Promo That Worked", company: "RetailCo",
    domain: "Marketing Analytics", difficulty: "core", estMinutes: 6,
    tags: ["incrementality", "counterfactual", "cannibalization"],
    role: "Junior Marketing Analyst",
    situation: "Sales spiked 18% the week of the 20%-off promo.",
    belief: "The Head of Growth is convinced the promo drove it and wants to run it every month.",
    realDriver: "The lift is mostly pull-forward plus a seasonal peak the promo happened to coincide with. Measured against a holdout region that got no promo, incremental lift is near zero — and full-price sales were cannibalized.",
    lesson: "Measure incrementality against a counterfactual (a holdout/baseline), not a raw before/after that a season or pull-forward can fake.",
  },
  {
    id: "saas-activation-dip", title: "The Activation Dip", company: "Flowdesk",
    domain: "Product Analytics", difficulty: "hard", estMinutes: 7,
    tags: ["Simpson's paradox", "mix shift", "segmentation"],
    role: "Product Analyst",
    situation: "Activation rate dropped from 41% to 34% right after the onboarding redesign.",
    belief: "The PM is convinced the redesign hurt activation and wants to roll it back this week.",
    realDriver: "A large paid-marketing push flooded signups with low-intent free users (a mix shift). Within every acquisition segment, activation actually improved after the redesign — the blended number fell only because the mix changed.",
    lesson: "Simpson's paradox / mix shift: a pooled rate can move opposite to every segment. Segment before you conclude a change caused a drop.",
  },
  {
    id: "neobank-fraud-spike", title: "The Fraud Spike", company: "NeoBank",
    domain: "Risk Analytics", difficulty: "hard", estMinutes: 7,
    tags: ["base rates", "distribution shift", "precision"],
    role: "Risk Analyst",
    situation: "The fraud model's flagged transactions tripled last month.",
    belief: "The Head of Risk assumes the model has broken and wants it retrained immediately.",
    realDriver: "A new product launched to a genuinely riskier customer cohort — the base rate of fraud rose, so more true positives is expected. On the new population the model's precision is unchanged; the raw flag count rose because the input distribution shifted, not because the model degraded.",
    lesson: "A raw flag count conflates base rate with model quality. Judge a classifier on precision/recall within the current population, not the volume of flags.",
  },
  {
    id: "shipfast-carrier", title: "The Slower Deliveries", company: "ShipFast",
    domain: "Operations Analytics", difficulty: "intro", estMinutes: 5,
    tags: ["confounding", "like-for-like", "segmentation"],
    role: "Operations Analyst",
    situation: "Average delivery time rose from 2.1 to 2.9 days after switching to a new carrier.",
    belief: "The Ops lead blames the new carrier and wants to switch back.",
    realDriver: "Two confounders landed the same week: a holiday volume surge, and a newly-served remote region far from any hub. On like-for-like lanes and volumes, the new carrier is actually faster.",
    lesson: "Confounding: a headline average can move because the mix of what you're averaging changed. Compare like-for-like before blaming the one thing that changed.",
  },
  {
    id: "cartly-checkout", title: "The Checkout Cliff", company: "Cartly",
    domain: "Product Analytics", difficulty: "core", estMinutes: 6,
    tags: ["segmentation", "funnel", "aggregation trap"],
    role: "Growth Analyst",
    situation: "Checkout abandonment jumped from 68% to 76% the week the checkout was redesigned.",
    belief: "The design lead assumes the redesign is worse and wants an immediate revert.",
    realDriver: "Desktop abandonment actually improved. The entire jump is on mobile, where a new address field broke browser autofill. The aggregate hid a concentrated, fixable failure.",
    lesson: "An aggregate funnel metric can hide a failure concentrated in one segment. Cut by device/platform before reverting the whole thing.",
  },
  {
    id: "streamly-abtest", title: "The Winning Test", company: "Streamly",
    domain: "Experimentation", difficulty: "hard", estMinutes: 7,
    tags: ["peeking", "sample ratio mismatch", "novelty effect"],
    role: "Experimentation Analyst",
    situation: "The new paywall variant is up 6% and hit p<0.05 three days into the test.",
    belief: "The PM wants to call it a winner and ship it now.",
    realDriver: "Stopping the moment it crossed significance inflates false positives (peeking). There's also a sample-ratio mismatch from bot traffic skewing the split, and a novelty effect. Run to the pre-registered duration and the lift is indistinguishable from zero.",
    lesson: "Don't peek and stop early — it manufactures false winners. Check the sample-ratio and run the pre-registered horizon before calling a result.",
  },
  {
    id: "subly-ltv", title: "The Golden Cohort", company: "Subly",
    domain: "Growth Analytics", difficulty: "core", estMinutes: 6,
    tags: ["survivorship bias", "cohort immaturity", "LTV"],
    role: "Growth Analyst",
    situation: "Reported LTV looks huge, so leadership wants to pour more into acquisition.",
    belief: "The CFO wants to raise the acquisition budget on the strength of the headline LTV.",
    realDriver: "LTV was computed only on still-active users and extrapolated from young cohorts whose churn hasn't landed yet. Cohort-complete LTV is far lower — below CAC for recent cohorts.",
    lesson: "Survivorship bias + immature cohorts inflate LTV. Use cohort-complete or churn-adjusted LTV, and compare like-aged cohorts, before acting on it.",
  },
  {
    id: "helply-csat", title: "The CSAT Drop", company: "Helply",
    domain: "CX Analytics", difficulty: "intro", estMinutes: 5,
    tags: ["response bias", "mix shift", "metric validity"],
    role: "CX Analyst",
    situation: "CSAT fell from 4.4 to 3.9 this month.",
    belief: "The Support Director assumes the agents are slipping and wants to put them on a coaching plan.",
    realDriver: "A new post-chat survey trigger changed who responds (angrier customers now get surveyed), and ticket mix shifted toward a broken billing feature. Agent-level quality is unchanged.",
    lesson: "A metric's own population can change under you (response/selection bias + mix shift). Check who is being measured before blaming the people measured.",
  },
  {
    id: "pantree-stockouts", title: "The Stockout Surge", company: "Pantree",
    domain: "Supply Analytics", difficulty: "core", estMinutes: 6,
    tags: ["aggregation trap", "concentration", "Pareto"],
    role: "Supply Chain Analyst",
    situation: "Stockout incidents rose 40% last quarter.",
    belief: "The Ops VP wants to raise safety stock across the entire catalogue.",
    realDriver: "About 80% of the stockouts come from just 3 SKUs sharing one supplier whose lead time blew out. The rest of the catalogue is fine. A blanket restock ties up capital for no reason.",
    lesson: "Aggregation hides concentration. Disaggregate (Pareto) to find where the problem actually lives before taking a blanket, expensive action.",
  },
];

// ── Prompts ──────────────────────────────────────────────────────────────────
const SYSTEM = `You author cases for "The Case Room", a strategic-judgment trainer for data/analytics learners. A case teaches ONE analytical lesson by making the learner commit to high-level decisions, each with a baked-in consequence, then diffing their path against a gold path.

You output ONE JSON object matching this exact schema (no prose, no markdown, no code fences — JSON only):

- id, title
- scenario: { role, company, situation, stakeholderBelief, question }
- decisions: an array of EXACTLY three, in this order and with these exact ids and flags:
  1. { id:"framing",        flag:"framing_quality", prompt, options:[4], gold }
  2. { id:"evidence",       flag:"metric_validity", prompt, artifact, options:[2], gold }
  3. { id:"interpretation", flag:"causal_caution",  prompt, options:[2], gold }
- goldPath: { framing, evidence, interpretation } — each the gold option id
- insight: 2–4 sentences revealing the real driver and naming the lesson

Every option: { id ("A","B",...), label, detail, flag ("strong"|"weak"), consequence, divergenceCost }.
Rules that MUST hold:
- In each decision EXACTLY ONE option has flag "strong", and its id equals that decision's "gold" and goldPath entry.
- The strong option's divergenceCost is "" (empty). Every weak option has a SHORT, DISTINCT divergenceCost (what choosing it cost — one clause).
- framing has 4 options (1 strong = the sound investigative framing; 3 weak, each a different real analyst mistake). evidence has 2 (strong = the valid/normalized metric; weak = the naive metric that fakes the signal). interpretation has 2 (strong = state the finding but recommend confirming causally / a holdout; weak = overclaim causation and act).
- "consequence" is what the learner sees AFTER committing: concrete, 1–3 sentences, shows why a weak choice misleads and why the strong choice opens the real thread. Never punitive.
- The stakeholderBelief is a PLAUSIBLE red herring; the case must be winnable by sound reasoning, and the insight is non-obvious.
- artifact (evidence decision) is a placeholder chart: { type:"bars", title, bars:[{label,value,highlight?}], caption }. Give the STRONG evidence option its own artifact too (the normalized/correct view that makes the real driver unmistakable, with the real-driver bar highlighted:true). Keep numbers plausible and internally consistent with the story.

Here is a complete, gold-standard example case to match in structure and quality:

${CHURN}`;

function genUser(brief) {
  return `Author a new case as JSON.

id: ${brief.id}
title: ${brief.title}
role: ${brief.role}
company: ${brief.company}
situation: ${brief.situation}
stakeholder belief (the red herring): ${brief.belief}
the REAL driver (what segmentation / the valid metric reveals): ${brief.realDriver}
the lesson to teach: ${brief.lesson}

Build the three decisions so a sound analyst reaches the real driver: framing = how to investigate (strong = diagnostic/counterfactual framing that doesn't anchor on the belief); evidence = which metric/cut to trust (strong = the valid one that exposes the real driver; give it the highlighted artifact); interpretation = what to tell the stakeholder (strong = findings + appropriate caution + a path to certainty). Make the insight land the lesson. Output JSON only.`;
}

const CRITIC_SYSTEM = `You are a strict reviewer of "Case Room" cases (strategic-judgment training for data analysts). Judge ONLY the case JSON you are given. Return JSON: { "verdict": "pass" | "revise", "issues": string[] }.

Flag an issue (→ "revise") if ANY of these fail:
- There is not exactly one defensible gold/strong option per decision, or a "weak" option is actually just as good as the gold.
- The stakeholder belief is not a PLAUSIBLE red herring (too obviously wrong, or actually correct).
- The three muscles aren't orthogonal: framing (how to investigate), evidence (metric validity), judgment (causal caution) should each test a distinct thing.
- Any weak option's divergenceCost is vague, generic, or duplicates another.
- The insight is obvious, or not actually supported by the case's own decisions/artifact.
- The artifact numbers contradict the story (e.g. the highlighted bar isn't the real driver, or the naive vs normalized views don't tell the intended trap).
- It doesn't read like a real job scenario.
Be terse. If it's genuinely good, return {"verdict":"pass","issues":[]}.`;

// ── Claude call + JSON extraction ────────────────────────────────────────────
async function call(system, user, maxTokens = 3000) {
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }],
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model output");
  return JSON.parse(body.slice(start, end + 1));
}

// ── Deterministic schema validation ──────────────────────────────────────────
const EXPECTED = [
  { id: "framing", flag: "framing_quality", n: 4 },
  { id: "evidence", flag: "metric_validity", n: 2 },
  { id: "interpretation", flag: "causal_caution", n: 2 },
];
function validate(c) {
  const e = [];
  if (!c || typeof c !== "object") return ["not an object"];
  if (!c.id) e.push("missing id");
  if (!c.title) e.push("missing title");
  const s = c.scenario ?? {};
  for (const k of ["role", "company", "situation", "stakeholderBelief", "question"])
    if (!s[k]) e.push(`scenario.${k} missing`);
  if (!Array.isArray(c.decisions) || c.decisions.length !== 3) {
    e.push("decisions must be an array of 3");
    return e;
  }
  c.decisions.forEach((d, i) => {
    const exp = EXPECTED[i];
    if (d.id !== exp.id) e.push(`decision ${i} id "${d.id}" != "${exp.id}"`);
    if (d.flag !== exp.flag) e.push(`decision ${d.id} flag "${d.flag}" != "${exp.flag}"`);
    if (!d.prompt) e.push(`decision ${d.id} missing prompt`);
    if (!Array.isArray(d.options) || d.options.length !== exp.n)
      e.push(`decision ${d.id} must have ${exp.n} options`);
    const strong = (d.options ?? []).filter((o) => o.flag === "strong");
    if (strong.length !== 1) e.push(`decision ${d.id} must have exactly 1 strong option (has ${strong.length})`);
    else if (strong[0].id !== d.gold) e.push(`decision ${d.id} gold "${d.gold}" != strong option "${strong[0].id}"`);
    if (c.goldPath?.[d.id] !== d.gold) e.push(`goldPath.${d.id} != decision gold`);
    (d.options ?? []).forEach((o) => {
      for (const k of ["id", "label", "detail", "consequence"]) if (!o[k]) e.push(`decision ${d.id} option ${o.id ?? "?"}: missing ${k}`);
      if (!["strong", "weak"].includes(o.flag)) e.push(`decision ${d.id} option ${o.id}: bad flag`);
      if (o.flag === "weak" && !o.divergenceCost?.trim()) e.push(`decision ${d.id} option ${o.id}: weak needs divergenceCost`);
      if (o.flag === "strong" && o.divergenceCost && o.divergenceCost.trim()) e.push(`decision ${d.id} strong option ${o.id}: divergenceCost must be ""`);
    });
  });
  if (!c.insight?.trim()) e.push("missing insight");
  return e;
}

// ── Author one brief (generate → validate/repair → critique/revise) ──────────
async function author(brief) {
  let obj = extractJson(await call(SYSTEM, genUser(brief)));
  let errs = validate(obj);
  let round = 0;
  // Repair schema failures, then run one critic pass (and one revise) — capped.
  while (round < 3) {
    if (errs.length) {
      const fix = `The case JSON you produced has schema problems. Fix ALL of these and return the full corrected JSON only:\n- ${errs.join("\n- ")}\n\nHere is the JSON to fix:\n${JSON.stringify(obj)}`;
      obj = extractJson(await call(SYSTEM, fix));
      errs = validate(obj);
      round++;
      continue;
    }
    const critique = extractJson(await call(CRITIC_SYSTEM, JSON.stringify(obj)));
    if (critique.verdict === "pass" || round >= 2) {
      return { obj, critique, rounds: round, schemaOk: errs.length === 0 };
    }
    const revise = `A reviewer flagged these issues. Revise the case to fix them and return the full JSON only:\n- ${(critique.issues ?? []).join("\n- ")}\n\nCase to revise:\n${JSON.stringify(obj)}`;
    obj = extractJson(await call(SYSTEM, revise));
    errs = validate(obj);
    round++;
  }
  return { obj, critique: { verdict: "revise", issues: ["max rounds reached"] }, rounds: round, schemaOk: errs.length === 0 };
}

// ── Run ──────────────────────────────────────────────────────────────────────
async function main() {
  const targets = BRIEFS.filter((b) => (ONLY ? b.id === ONLY : true)).filter(
    (b) => FORCE || !existsSync(path.join(DATA_DIR, `${b.id}.json`)),
  );
  console.log(`Authoring ${targets.length} case(s) with ${MODEL}…\n`);

  const results = [];
  for (const brief of targets) {
    process.stdout.write(`• ${brief.id} … `);
    try {
      const { obj, critique, rounds, schemaOk } = await author(brief);
      obj.id = brief.id; // pin id regardless of what the model echoed
      writeFileSync(path.join(DATA_DIR, `${brief.id}.json`), JSON.stringify(obj, null, 2) + "\n");
      const errs = validate(obj);
      results.push({ brief, ok: errs.length === 0, verdict: critique.verdict, issues: critique.issues ?? [], rounds });
      console.log(`${errs.length === 0 ? "schema ✓" : "schema ✗"} · critic:${critique.verdict} · ${rounds} revision(s)`);
      if (errs.length) console.log(`    schema errors: ${errs.join("; ")}`);
    } catch (err) {
      results.push({ brief, ok: false, error: err.message });
      console.log(`FAILED: ${err.message}`);
    }
  }

  // Rebuild the manifest: churn first, then every authored case that exists.
  const stubs = [
    { id: "freshbox-churn", title: "The Churn Spike", company: "FreshBox", difficulty: "intro", domain: "Data Analysis", estMinutes: 5, tags: ["correlation vs causation", "segmentation", "metric validity"] },
    ...BRIEFS.filter((b) => existsSync(path.join(DATA_DIR, `${b.id}.json`))).map((b) => ({
      id: b.id, title: b.title, company: b.company, difficulty: b.difficulty, domain: b.domain, estMinutes: b.estMinutes, tags: b.tags,
    })),
  ];
  writeFileSync(path.join(DATA_DIR, "manifest.json"), JSON.stringify({ batch: "2026-07", cases: stubs }, null, 2) + "\n");

  console.log(`\nManifest rebuilt: ${stubs.length} cases in batch 2026-07.`);
  const flagged = results.filter((r) => !r.ok || r.verdict === "revise" || r.error);
  if (flagged.length) {
    console.log(`\n⚠ ${flagged.length} case(s) need your eyes:`);
    for (const r of flagged) console.log(`  - ${r.brief.id}: ${r.error ?? `${r.verdict} (${(r.issues ?? []).join("; ") || "schema"})`}`);
  } else {
    console.log("\nAll authored cases passed schema + critic. Review the content before publishing.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
