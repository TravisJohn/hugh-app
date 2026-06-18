import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { focusedLearningSystemPrompt, parseClaudeJson } from "@/lib/claude/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ChatMessage {
  role:    "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    topic:    string;
    messages: ChatMessage[];
  };

  const { topic, messages } = body;

  if (!topic?.trim() || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "topic and messages are required" }, { status: 400 });
  }

  // Cap transcript size to guard token cost
  const capped = messages.slice(-20);

  try {
    const res = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     focusedLearningSystemPrompt(topic.trim()),
      messages:   capped,
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "{}";

    let reply      = "";
    let isOffTopic = false;
    try {
      const parsed = parseClaudeJson<{ reply: string; isOffTopic: boolean }>(raw);
      reply      = parsed.reply      ?? "";
      isOffTopic = parsed.isOffTopic ?? false;
    } catch {
      // Claude drifted from JSON format — treat the raw text as the reply
      reply = raw.trim();
    }

    return NextResponse.json({ reply: reply || "I couldn't generate a response. Please try again.", isOffTopic });
  } catch (err) {
    console.error("[learn/chat] Claude error:", err);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 502 });
  }
}
