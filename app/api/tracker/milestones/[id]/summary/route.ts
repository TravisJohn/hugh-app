import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { masterySummaryPrompt } from "@/lib/claude/prompts";
import { checkUsageAllowed, logUsage } from "@/lib/usage";
import { type LearningPoint } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface MilestoneRow {
  id:                string;
  title:             string;
  summary:           string;
  kanban_column:     string;
  learning_points:   LearningPoint[] | null;
  coverage:          { coveredIds: string[] } | null;
  mastery_score:     number | null;
  mastery_feedback:  string | null;
  tracks:            { user_id: string; topic_description: string } | null;
}

// POST: (re)generate the mastery "what you learned" summary document for a
// mastered milestone, store it, and return it. Auto-called on first mastery and
// from the drawer's Regenerate button.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, reason } = await checkUsageAllowed(userId);
  if (!allowed) {
    const msg = reason === "limit_reached"
      ? "Monthly usage limit reached. Please contact Travis to reset or upgrade."
      : "Your access has been restricted. Please contact support.";
    return NextResponse.json({ error: msg }, { status: reason === "limit_reached" ? 429 : 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("milestones")
    .select("id, title, summary, kanban_column, learning_points, coverage, mastery_score, mastery_feedback, tracks!track_id!inner(user_id, topic_description)")
    .eq("id", id)
    .single();

  const ms = data as unknown as MilestoneRow | null;
  if (!ms || ms.tracks?.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (ms.kanban_column !== "done") {
    return NextResponse.json({ error: "Milestone is not mastered" }, { status: 409 });
  }

  // Gather the learner's diary entries (with any noted gaps) for this milestone.
  const { data: entries } = await supabase
    .from("milestone_entries")
    .select("title, body, gap_note")
    .eq("milestone_id", id)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "Add a diary entry before generating a summary" }, { status: 422 });
  }

  const coveredIds = new Set(ms.coverage?.coveredIds ?? []);
  const points = (ms.learning_points ?? []).map(p => ({ text: p.text, covered: coveredIds.has(p.id) }));
  const diaryEntries = entries.map(e => ({
    title: (e.title as string | null) ?? null,
    body:  e.body as string,
    gap:   (e.gap_note as string | null) ?? null,
  }));

  const prompt = masterySummaryPrompt({
    topic:            ms.tracks?.topic_description ?? ms.title,
    milestoneTitle:   ms.title,
    milestoneSummary: ms.summary,
    points,
    diaryEntries,
    masteryScore:     ms.mastery_score,
    masteryFeedback:  ms.mastery_feedback,
  });

  try {
    const res = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    });

    const doc = (res.content[0]?.type === "text" ? res.content[0].text : "").trim();
    if (!doc) {
      return NextResponse.json({ error: "Empty summary generated" }, { status: 502 });
    }

    const generatedAt = new Date().toISOString();
    await supabase
      .from("milestones")
      .update({ summary_doc: doc, summary_doc_at: generatedAt })
      .eq("id", id);

    void logUsage({ userId, feature: "tracker/summary", tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens });

    return NextResponse.json({ summaryDoc: doc, generatedAt });
  } catch (err) {
    console.error("[tracker/summary] error:", err);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 502 });
  }
}
