import Anthropic from "@anthropic-ai/sdk";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  milestoneGenerationPrompt,
  parseMilestoneGeneration,
  type MilestoneGenerationResult,
} from "@/lib/claude/prompts";
import { assignBacklogPriority } from "@/lib/tracker/priority";
import { logUsage } from "@/lib/usage";
import { logSafeError } from "@/lib/observability/log";
import { type KanbanColumn } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model for track generation — see CLAUDE.md "Model Selection". Kept in one
// place so the API call and the usage log can never disagree about billing.
const MODEL = "claude-sonnet-4-6";

/** A track could not be built. Distinct from a Claude/parse error so the
 *  caller can tell "the model misbehaved" from "the database refused". */
export class TrackGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackGenerationError";
  }
}

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

// A track with no milestones is not a partial success, it is an empty Kanban
// board with no explanation on it. If the milestone insert fails we delete the
// track we just made rather than leave an orphan row behind: the goal's
// track_status goes to 'failed', and a retry must not find a stale track
// sitting where the new one belongs.
async function deleteOrphanTrack(supabase: SupabaseClient, trackId: string): Promise<void> {
  const { error } = await supabase.from("tracks").delete().eq("id", trackId);
  if (error) {
    // Nothing more we can do here — the throw that follows is the real signal.
    // Logged loudly because it leaves a row that a retry will have to survive.
    logSafeError(`generateTrack orphan cleanup ${trackId}`, error);
  }
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
    throw new TrackGenerationError(trackError?.message ?? "Failed to create track");
  }

  const trackId = track.id as string;

  const validCols: KanbanColumn[] = ["backlog", "learn", "review", "done"];
  const milestoneRows = parsed.milestones.map((m, i) => ({
    track_id:      trackId,
    title:         m.title,
    summary:       m.summary,
    kanban_column: validCols.includes(m.column as KanbanColumn)
      ? (m.column as KanbanColumn)
      : "backlog",
    position: i,
  }));

  // The insert is checked, and the returned rows are counted. Dropping either
  // check is what produced a "ready" track with an empty board and no error on
  // any surface — the failure the learner could see but the system could not.
  const { data: inserted, error: milestoneError } = await supabase
    .from("milestones")
    .insert(milestoneRows)
    .select("id");

  if (milestoneError) {
    await deleteOrphanTrack(supabase, trackId);
    throw new TrackGenerationError(`Failed to save milestones: ${milestoneError.message}`);
  }

  if (!inserted || inserted.length !== milestoneRows.length) {
    await deleteOrphanTrack(supabase, trackId);
    throw new TrackGenerationError(
      `Milestone insert was partial: expected ${milestoneRows.length}, saved ${inserted?.length ?? 0}`,
    );
  }

  // One-time agentic backlog ranking. Non-blocking: a failure here must not
  // break track creation — the board simply falls back to no suggested order.
  try {
    const usage = await assignBacklogPriority(supabase, trackId, topic);
    if (usage) {
      void logUsage({ userId, model: usage.model, feature: "tracker/priority", tokensIn: usage.inputTokens, tokensOut: usage.outputTokens });
    }
  } catch (err) {
    logSafeError("generateTrack backlog priority", err, [topic]);
  }

  return trackId;
}
