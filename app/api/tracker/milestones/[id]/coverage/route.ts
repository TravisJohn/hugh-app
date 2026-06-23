import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { learningPointsPrompt, coveragePrompt, parseClaudeJson } from "@/lib/claude/prompts";
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

// ── POST: recompute coverage from diary entries (+ optional chat text) ──────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed } = await checkUsageAllowed(userId);
  if (!allowed) return NextResponse.json({ skipped: true });

  const { id } = await params;
  const { chatText } = (await request.json().catch(() => ({}))) as { chatText?: string };
  const supabase = await createClient();

  const ms = await loadOwnedMilestone(supabase, id, userId);
  if (!ms) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const points = await ensureLearningPoints(supabase, ms, userId);
  if (points.length === 0) {
    return NextResponse.json({ learningPoints: [], coverage: { coveredIds: [], updatedAt: new Date().toISOString() } });
  }

  // Gather activity: diary entries + this Ask session's chat
  const { data: entries } = await supabase
    .from("milestone_entries")
    .select("title, body")
    .eq("milestone_id", id)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const diaryText = (entries ?? [])
    .map(e => `${e.title ? e.title + ": " : ""}${e.body}`)
    .join("\n\n");
  const activityText = [diaryText, chatText?.trim()].filter(Boolean).join("\n\n");

  if (!activityText) {
    const coverage = { coveredIds: [] as string[], updatedAt: new Date().toISOString() };
    await supabase.from("milestones").update({ coverage }).eq("id", id);
    return NextResponse.json({ learningPoints: points, coverage });
  }

  try {
    const res = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 300,
      messages:   [{ role: "user", content: coveragePrompt(ms.title, points, activityText) }],
    });
    const raw    = res.content[0]?.type === "text" ? res.content[0].text : "{}";
    const parsed = parseClaudeJson<{ coveredIds: string[] }>(raw);
    const validIds = new Set(points.map(p => p.id));
    const coveredIds = (parsed.coveredIds ?? []).filter(cid => validIds.has(cid));
    const coverage = { coveredIds, updatedAt: new Date().toISOString() };

    await supabase.from("milestones").update({ coverage }).eq("id", id);
    void logUsage({ userId, feature: "tracker/coverage", tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens });
    return NextResponse.json({ learningPoints: points, coverage });
  } catch (err) {
    console.error("[tracker/coverage] error:", err);
    return NextResponse.json({ error: "Failed to assess coverage" }, { status: 502 });
  }
}
