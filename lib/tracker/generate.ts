import Anthropic from "@anthropic-ai/sdk";
import { type SupabaseClient } from "@supabase/supabase-js";
import { milestoneGenerationPrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { assignBacklogPriority } from "@/lib/tracker/priority";
import { logUsage } from "@/lib/usage";
import { type KanbanColumn } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateTrack(
  supabase: SupabaseClient,
  userId:  string,
  topic:   string,
  goalId?: string,
): Promise<string> {
  const res = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 2048,
    messages:   [{ role: "user", content: milestoneGenerationPrompt(topic) }],
  });

  const raw    = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  const parsed = parseClaudeJson<{
    trackTitle: string;
    milestones: Array<{ title: string; summary: string; column: string }>;
  }>(raw);

  const trackRow: Record<string, unknown> = {
    user_id:           userId,
    title:             parsed.trackTitle,
    topic_description: topic,
  };
  if (goalId) trackRow.goal_id = goalId;

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .insert(trackRow)
    .select("id")
    .single();

  if (trackError || !track) {
    throw new Error(trackError?.message ?? "Failed to create track");
  }

  const validCols: KanbanColumn[] = ["backlog", "learn", "review", "done"];
  const milestoneRows = parsed.milestones.map((m, i) => ({
    track_id:      track.id as string,
    title:         m.title,
    summary:       m.summary,
    kanban_column: validCols.includes(m.column as KanbanColumn)
      ? (m.column as KanbanColumn)
      : "backlog",
    position: i,
  }));

  await supabase.from("milestones").insert(milestoneRows);

  // One-time agentic backlog ranking. Non-blocking: a failure here must not
  // break track creation — the board simply falls back to no suggested order.
  try {
    const usage = await assignBacklogPriority(supabase, track.id as string, topic);
    if (usage) {
      void logUsage({ userId, feature: "tracker/priority", tokensIn: usage.inputTokens, tokensOut: usage.outputTokens });
    }
  } catch (err) {
    console.error("[generateTrack] backlog priority ranking failed:", err);
  }

  return track.id as string;
}
