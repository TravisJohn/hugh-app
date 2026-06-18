import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { refineTopicPrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { generateTrack } from "@/lib/tracker/generate";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  // Step 2: create the learning goal
  const { data: goal, error: goalError } = await supabase
    .from("learning_goals")
    .insert({ user_id: userId, topic: finalTopic, end_date })
    .select("*")
    .single();

  if (goalError || !goal) {
    console.error("[dashboard/goals] DB error:", goalError?.message);
    return NextResponse.json({ error: "Failed to save goal" }, { status: 500 });
  }

  // Step 3: generate the linked track + milestones (non-blocking on failure)
  try {
    await generateTrack(supabase, userId, finalTopic, goal.id as string);
  } catch (err) {
    console.error("[dashboard/goals] track generation error:", err);
    // Goal is still returned — track can be created manually from TrackerDashboard
  }

  return NextResponse.json({ goal, tips });
}
