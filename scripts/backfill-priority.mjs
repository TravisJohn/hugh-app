// One-time backfill: assign agentic backlog priority_rank/priority_reason to
// EXISTING tracks (new goals get this automatically at generation time).
// Idempotent — skips any track whose backlog is already fully ranked.
//
// Run once:  node scripts/backfill-priority.mjs
// Safe to delete afterwards. Mirrors lib/tracker/priority.ts + backlogPriorityPrompt.
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── env ──────────────────────────────────────────────────────────────────
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const e = t.indexOf("="); if (e === -1) continue;
  const k = t.slice(0, e).trim(), v = t.slice(e + 1).trim();
  if (k && !(k in process.env)) process.env[k] = v;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function prompt(topic, items) {
  return `You are an expert curriculum architect. A learner wants to learn: "${topic}".

Below are the backlog learning milestones for this goal. Reason about their conceptual dependencies and pedagogy, then put them in the best build order — what genuinely must be understood before what, so each milestone builds on the ones before it. Use real judgment about prerequisites, not a fixed formula.

Milestones:
${items.map(it => `${it.n}. ${it.title} — ${it.summary}`).join("\n")}

Return ALL of them in recommended study order (first = study first). For each, give a one-line reason (max ~15 words) for its placement relative to the others.

Respond with ONLY valid JSON, no markdown fences:
{"ordered": [{"n": <milestone number>, "reason": "..."}]}`;
}

function parseJson(text) {
  return JSON.parse(text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "").trim());
}

async function rankTrack(track) {
  const { data: rows } = await sb
    .from("milestones")
    .select("id, title, summary, priority_rank")
    .eq("track_id", track.id)
    .eq("kanban_column", "backlog")
    .order("position", { ascending: true });

  const milestones = rows ?? [];
  if (milestones.length === 0) return "no backlog";
  if (milestones.every(m => m.priority_rank != null)) return "already ranked";

  const items = milestones.map((m, i) => ({ n: i + 1, title: m.title, summary: m.summary }));
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 1200,
    messages: [{ role: "user", content: prompt(track.topic_description, items) }],
  });
  const raw = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  const parsed = parseJson(raw);

  const seen = new Set();
  const assignments = [];
  let rank = 1;
  for (const entry of parsed.ordered ?? []) {
    const idx = entry.n - 1;
    if (idx < 0 || idx >= milestones.length || seen.has(entry.n)) continue;
    seen.add(entry.n);
    assignments.push({ id: milestones[idx].id, rank: rank++, reason: (entry.reason ?? "").trim() || null });
  }
  milestones.forEach((m, i) => { if (!seen.has(i + 1)) assignments.push({ id: m.id, rank: rank++, reason: null }); });

  await Promise.all(assignments.map(a =>
    sb.from("milestones").update({ priority_rank: a.rank, priority_reason: a.reason }).eq("id", a.id)
  ));
  return `ranked ${assignments.length}`;
}

async function main() {
  const { data: tracks } = await sb.from("tracks").select("id, topic_description");
  console.log(`Found ${tracks?.length ?? 0} tracks.\n`);
  for (const track of tracks ?? []) {
    try {
      const result = await rankTrack(track);
      console.log(`  [${result}] ${track.topic_description?.slice(0, 50)}`);
    } catch (e) {
      console.log(`  [ERROR] ${track.topic_description?.slice(0, 50)} — ${e.message}`);
    }
  }
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
