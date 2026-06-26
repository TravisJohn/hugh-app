import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { ROOM_CONTEXT, hintGenerationPrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { isPresetRoom, type Room } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    question:    string;
    room:        Room;
    questionId?: string;
    topic?:      string;
  };

  const { question, room, questionId, topic } = body;

  if (!question || !room) {
    return NextResponse.json(
      { error: "question and room are required" },
      { status: 400 }
    );
  }

  // Return cached hint if it exists
  if (questionId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("questions")
      .select("hint")
      .eq("id", questionId)
      .single();

    if (data?.hint) {
      return NextResponse.json({ hint: data.hint });
    }
  }

  // Generate via Claude
  const topicContext = isPresetRoom(room)
    ? ROOM_CONTEXT[room]
    : (topic ?? "general data and ML engineering");

  let hint: string;
  try {
    const res = await anthropic.messages.create({
      // Single-sentence hint (short, low-stakes gen) — Haiku is sufficient and cheaper.
      model: "claude-haiku-4-5",
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: hintGenerationPrompt(question, topicContext),
        },
      ],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const parsed = parseClaudeJson<{ hint: string }>(text);
    hint = parsed.hint;
  } catch (err) {
    console.error("[generate-hint] Claude error:", err);
    return NextResponse.json(
      { error: "Failed to generate hint" },
      { status: 502 }
    );
  }

  // Persist so repeat clicks return cache, not a new API call
  if (questionId) {
    const supabase = await createClient();
    const { error: dbError } = await supabase
      .from("questions")
      .update({ hint })
      .eq("id", questionId);

    if (dbError) {
      console.error("[generate-hint] DB error:", dbError.message);
    }
  }

  return NextResponse.json({ hint });
}
