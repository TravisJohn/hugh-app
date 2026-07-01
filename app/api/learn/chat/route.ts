import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { focusedLearningSystemPrompt } from "@/lib/claude/prompts";
import { parseChatResponse } from "@/lib/askcode/parse";
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
    topic:             string;
    messages:          ChatMessage[];
    focusMode?:        boolean;
    codeModeRequested?: boolean;
  };

  const { topic, messages, focusMode, codeModeRequested } = body;

  if (!topic?.trim() || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "topic and messages are required" }, { status: 400 });
  }

  // Cap transcript size to guard token cost
  const capped = messages.slice(-20);

  // Code-mode request: the keyword only *gates* the request — Hugh's own reply
  // decides whether the topic is code-worthy. We signal the explicit ask by
  // appending a reminder to the FINAL user turn only, never the system prompt, so
  // the cached prompt prefix (system + earlier turns) stays intact across turns.
  if (codeModeRequested && capped.length > 0) {
    const last = capped[capped.length - 1];
    if (last.role === "user") {
      capped[capped.length - 1] = {
        role:    "user",
        content: `${last.content}\n\n[The learner has explicitly requested code mode. If this topic has real code worth practising, return a codeExample plus a mirror-typing action point; if it does not, set codeExample to null and explain that code isn't needed here.]`,
      };
    }
  }

  try {
    const res = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     focusedLearningSystemPrompt(topic.trim()),
      messages:   capped,
      // Prompt caching: auto-place a breakpoint on the last message, so the
      // system prompt + prior conversation prefix is reused across turns of the
      // same chat. Cache reads cost ~0.1x; this is the bulk of learn/chat spend.
      // (Effective once the prefix exceeds Sonnet's ~2048-token cache minimum —
      // i.e. after the first couple of turns; shorter prefixes silently skip.)
      //
      // During a Pomodoro focus block we switch to the 1-hour TTL: deliberate,
      // spaced study leaves gaps >5 min between questions, which would expire the
      // default cache and force a re-write each turn. The 1h write costs 2x (vs
      // 1.25x) but is recovered the moment one such re-write is avoided.
      cache_control: focusMode ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" },
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "{}";

    // Tolerant parse: salvages the reply (and a clean code example) even when the
    // model emits unescaped quotes/newlines, so raw JSON never leaks to the chat.
    const { reply, isOffTopic, codeExample, covered } = parseChatResponse(raw);

    // Should be unreachable now (the parser echoes prose), but if a reply ever
    // comes back empty, log the raw output + stop reason so we can diagnose
    // instead of silently showing the generic fallback.
    if (!reply.trim()) {
      console.warn("[learn/chat] empty reply; stop_reason:", res.stop_reason, "raw:", raw.slice(0, 500));
    }

    // Count fresh input + cache writes against usage; cache reads (~0.1x cost)
    // are intentionally excluded so a warm cache eases the learner's quota.
    const tokensIn = res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0);
    void logUsage({ userId, feature: "learn/chat", tokensIn, tokensOut: res.usage.output_tokens });
    return NextResponse.json({
      reply: reply || "I couldn't generate a response. Please try again.",
      isOffTopic,
      codeExample,
      covered,
    });
  } catch (err) {
    console.error("[learn/chat] Claude error:", err);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 502 });
  }
}
