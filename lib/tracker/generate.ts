import Anthropic from "@anthropic-ai/sdk";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  milestoneGenerationPrompt,
  parseMilestoneGeneration,
  type MilestoneGenerationResult,
} from "@/lib/claude/prompts";
import { assignBacklogPriority } from "@/lib/tracker/priority";
import { logUsage } from "@/lib/usage";
import { type KanbanColumn } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model for track generation — see CLAUDE.md "Model Selection". Kept in one
// place so the API call and the usage log can never disagree about billing.
const MODEL = "claude-sonnet-4-6";

/** Tokens spent generating a track, so the caller can log them. */
interface GenerationUsage {
  inputTokens:  number;
  outputTokens: number;
}

// Retries once on a malformed/unparseable response — mirrors the retry
// pattern already used for the refine/classify-topic/domain-gate calls.
// Token counts accumulate across attempts: a discarded first attempt still
// costs money, so it must still be billed to the user.
async function generateMilestones(
  topic:        string,
  documentText?: string,
): Promise<{ parsed: MilestoneGenerationResult; usage: GenerationUsage }> {
  let lastErr: unknown = null;
  const usage: GenerationUsage = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: 2048,
        messages:   [{ role: "user", content: milestoneGenerationPrompt(topic, documentText) }],
      });
      usage.inputTokens  += res.usage.input_tokens;
      usage.outputTokens += res.usage.output_tokens;
      const raw = res.content[0]?.type === "text" ? res.content[0].text : "{}";
      return { parsed: parseMilestoneGeneration(raw), usage };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("milestone generation failed");
}

export async function generateTrack(
  supabase:      SupabaseClient,
  userId:        string,
  topic:         string,
  goalId?:       string,
  documentText?: string,
): Promise<string> {
  const { parsed, usage: genUsage } = await generateMilestones(topic, documentText);

  // Track generation is the single largest Claude call in the product. Log it
  // as soon as it returns, so the spend is recorded even if the DB writes fail.
  void logUsage({
    userId,
    model:     MODEL,
    feature:   "tracker/generate",
    tokensIn:  genUsage.inputTokens,
    tokensOut: genUsage.outputTokens,
  });

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
      void logUsage({ userId, model: usage.model, feature: "tracker/priority", tokensIn: usage.inputTokens, tokensOut: usage.outputTokens });
    }
  } catch (err) {
    console.error("[generateTrack] backlog priority ranking failed:", err);
  }

  return track.id as string;
}
