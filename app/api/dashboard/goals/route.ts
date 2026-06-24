import { type NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { refineTopicPrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { generateTrack } from "@/lib/tracker/generate";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Track generation runs post-response via `after()` and chains two Claude
// calls (milestones + backlog priority), so the invocation must be allowed to
// outlive the response. Hobby plans cap this at 10s regardless of the value.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    topic:    string;
    end_date: string;
    answers?: Array<{ question: string; answer: string }>;
  };

  const topic    = body.topic?.trim();
  const end_date = body.end_date?.trim();
  const answers  = body.answers ?? [];

  if (!topic || !end_date) {
    return NextResponse.json({ error: "topic and end_date are required" }, { status: 400 });
  }

  const supabase = await createClient();

  let finalTopic = topic;
  let tips: string[] = [];

  // Step 1: refine topic + get expert tips from Q&A answers
  if (answers.length > 0) {
    try {
      const prompt = refineTopicPrompt(topic, answers);
      const msg    = await anthropic.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 600,
        messages:   [{ role: "user", content: prompt }],
      });
      const text   = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const result = parseClaudeJson<{ refinedTopic: string; tips: string[] }>(text);
      if (result.refinedTopic) finalTopic = result.refinedTopic;
      if (Array.isArray(result.tips)) tips = result.tips;
    } catch (err) {
      console.error("[dashboard/goals] refinement error:", err);
    }
  }

  // Step 2: create the learning goal with track_status = 'pending'.
  // The response returns here — the track is built afterwards in `after()`.
  const { data: goal, error: goalError } = await supabase
    .from("learning_goals")
    .insert({ user_id: userId, topic: finalTopic, end_date, track_status: "pending" })
    .select("*")
    .single();

  if (goalError || !goal) {
    console.error("[dashboard/goals] DB error:", goalError?.message);
    return NextResponse.json({ error: "Failed to save goal" }, { status: 500 });
  }

  const goalId = goal.id as string;

  // Step 3: generate the track AFTER the response is sent. The frontend watches
  // learning_goals.track_status over Realtime to know when this completes.
  // A service-role client is used because the cookie-bound request client is
  // not guaranteed to be usable once the response lifecycle has ended.
  after(async () => {
    const service = createServiceClient();
    try {
      await generateTrack(service, userId, finalTopic, goalId);
      await service
        .from("learning_goals")
        .update({ track_status: "ready" })
        .eq("id", goalId);
    } catch (err) {
      console.error("[dashboard/goals] background track generation failed:", err);
      await service
        .from("learning_goals")
        .update({ track_status: "failed" })
        .eq("id", goalId);
    }
  });

  return NextResponse.json({ goal, tips });
}
