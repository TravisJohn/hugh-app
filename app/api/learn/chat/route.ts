import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { focusedLearningSystemPrompt, parseClaudeJson } from "@/lib/claude/prompts";
import { checkUsageAllowed, logUsage } from "@/lib/usage";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ChatMessage {
  role:    "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, reason } = await checkUsageAllowed(userId);
  if (!allowed) {
    const msg = reason === "limit_reached"
      ? "Monthly usage limit reached. Please contact Travis to reset or upgrade."
      : "Your access has been restricted. Please contact support.";
    return NextResponse.json({ error: msg }, { status: reason === "limit_reached" ? 429 : 403 });
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
      // Prompt caching: auto-place a 5-min breakpoint on the last message, so the
      // system prompt + prior conversation prefix is reused across turns of the
      // same chat. Cache reads cost ~0.1x; this is the bulk of learn/chat spend.
      // (Effective once the prefix exceeds Sonnet's ~2048-token cache minimum —
      // i.e. after the first couple of turns; shorter prefixes silently skip.)
      cache_control: { type: "ephemeral" },
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

    // Count fresh input + cache writes against usage; cache reads (~0.1x cost)
    // are intentionally excluded so a warm cache eases the learner's quota.
    const tokensIn = res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0);
    void logUsage({ userId, feature: "learn/chat", tokensIn, tokensOut: res.usage.output_tokens });
    return NextResponse.json({ reply: reply || "I couldn't generate a response. Please try again.", isOffTopic });
  } catch (err) {
    console.error("[learn/chat] Claude error:", err);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 502 });
  }
}
