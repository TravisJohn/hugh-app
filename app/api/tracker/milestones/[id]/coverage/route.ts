import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { learningPointsPrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { checkUsageAllowed, logUsage } from "@/lib/usage";
import { type LearningPoint } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface MilestoneRow {
  id:              string;
  title:           string;
  summary:         string;
  learning_points: LearningPoint[] | null;
  coverage:        { coveredIds: string[]; updatedAt: string } | null;
  tracks:          { user_id: string; topic_description: string } | null;
}

async function loadOwnedMilestone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id:       string,
  userId:   string,
): Promise<MilestoneRow | null> {
  const { data } = await supabase
    .from("milestones")
    .select("id, title, summary, learning_points, coverage, tracks!track_id!inner(user_id, topic_description)")
    .eq("id", id)
    .single();
  const row = data as unknown as MilestoneRow | null;
  if (!row || row.tracks?.user_id !== userId) return null;
  return row;
}

/** Generate the learning-points checklist for a milestone if it doesn't have one yet. */
async function ensureLearningPoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ms:       MilestoneRow,
  userId:   string,
): Promise<LearningPoint[]> {
  if (ms.learning_points && ms.learning_points.length > 0) return ms.learning_points;

  const topic = ms.tracks?.topic_description ?? ms.title;
  const res = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 500,
    messages:   [{ role: "user", content: learningPointsPrompt(topic, ms.title, ms.summary) }],
  });
  const raw    = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  const parsed = parseClaudeJson<{ points: string[] }>(raw);
  const points: LearningPoint[] = (parsed.points ?? [])
    .filter(p => p?.trim())
    .map((text, i) => ({ id: `p${i + 1}`, text: text.trim() }));

  await supabase.from("milestones").update({ learning_points: points }).eq("id", ms.id);
  void logUsage({ userId, feature: "tracker/points", tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens });
  return points;
}

// ── GET: return checklist (generating once if missing) + cached coverage ────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const ms = await loadOwnedMilestone(supabase, id, userId);
  if (!ms) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { allowed } = await checkUsageAllowed(userId);
  // If usage is blocked, still return whatever points already exist (no new call).
  const points = allowed ? await ensureLearningPoints(supabase, ms, userId) : (ms.learning_points ?? []);

  return NextResponse.json({ learningPoints: points, coverage: ms.coverage });
}

// ── POST: persist the learner's manual check-offs ───────────────────────────
// Coverage is a self-assessment the learner controls — they tick each idea once
// they're confident they understand it. We just validate the ids against the
// milestone's checklist and store them. No AI judgement is involved.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { coveredIds } = (await request.json().catch(() => ({}))) as { coveredIds?: string[] };
  if (!Array.isArray(coveredIds)) {
    return NextResponse.json({ error: "coveredIds must be an array" }, { status: 400 });
  }

  const supabase = await createClient();

  const ms = await loadOwnedMilestone(supabase, id, userId);
  if (!ms) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only accept ids that belong to this milestone's checklist.
  const validIds = new Set((ms.learning_points ?? []).map(p => p.id));
  const filtered = coveredIds.filter(cid => validIds.has(cid));
  const coverage = { coveredIds: filtered, updatedAt: new Date().toISOString() };

  await supabase.from("milestones").update({ coverage }).eq("id", id);

  return NextResponse.json({ learningPoints: ms.learning_points ?? [], coverage });
}
