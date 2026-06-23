import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { factCheckEntryPrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { checkUsageAllowed, logUsage } from "@/lib/usage";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface FactCheckResult {
  status:     "correct" | "incorrect";
  correction: string | null;
  gap:        string | null;
}

/**
 * Auto fact-check a single diary entry against its milestone's goal.
 * On "incorrect": persists the suggested correction and a permanent gap note,
 * leaving the lingering warning (corrected = false). On "correct": clears the
 * warning (corrected = true) but PRESERVES any existing gap note as a record.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed } = await checkUsageAllowed(userId);
  if (!allowed) {
    // Soft-fail: don't block the learner from writing, just skip the check.
    return NextResponse.json({ skipped: true });
  }

  const { entryId } = await params;
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("milestone_entries")
    .select("id, body, milestone_id, gap_note")
    .eq("id", entryId)
    .eq("user_id", userId)
    .single();

  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  // Resolve milestone title + track topic for grounding
  const { data: milestone } = await supabase
    .from("milestones")
    .select("title, tracks!track_id!inner(topic_description)")
    .eq("id", entry.milestone_id)
    .single();

  const title = (milestone?.title as string) ?? "this topic";
  const topic =
    (milestone?.tracks as { topic_description?: string } | null)?.topic_description ?? title;

  try {
    const res = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 700,
      messages:   [{ role: "user", content: factCheckEntryPrompt(topic, title, entry.body as string) }],
    });

    const raw    = res.content[0]?.type === "text" ? res.content[0].text : "{}";
    const parsed = parseClaudeJson<FactCheckResult>(raw);
    const isWrong = parsed.status === "incorrect";

    const update: {
      fact_status: "correct" | "incorrect";
      correction:  string | null;
      corrected:   boolean;
      gap_note?:   string | null;
    } = isWrong
      ? { fact_status: "incorrect", correction: parsed.correction ?? null, corrected: false, gap_note: parsed.gap ?? null }
      : { fact_status: "correct",   correction: null,                       corrected: true };
      // On "correct" we omit gap_note so the existing permanent record is preserved.

    const { data: updated } = await supabase
      .from("milestone_entries")
      .update(update)
      .eq("id", entryId)
      .eq("user_id", userId)
      .select("*")
      .single();

    void logUsage({ userId, feature: "tracker/verify", tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens });
    return NextResponse.json({ entry: updated });
  } catch (err) {
    console.error("[tracker/verify] error:", err);
    return NextResponse.json({ error: "Failed to verify entry" }, { status: 502 });
  }
}
