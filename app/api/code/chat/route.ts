import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { checkUsageAllowed, logUsage } from "@/lib/usage";

// Lightweight coding helper for the Code practice page. Haiku — the job is a
// short, focused Q&A about Python/code, not heavy reasoning (see Model Selection
// in CLAUDE.md). Server-side only; the browser never sees the API key.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Msg { role: "user" | "assistant"; content: string }

const SYSTEM = `You are Hugh, a friendly, concise coding helper living beside a Python practice drill.
- Keep it short: a sentence or two, plus a tiny snippet only when it genuinely helps.
- The learner is practising for muscle memory, so nudge toward the idea first. If they explicitly ask for the full answer, just give it.
- Stay on programming / data topics (mostly Python, pandas, SQL). If asked something off-topic, gently steer back.
- Be encouraging and plain-spoken. No preambles, no lecturing.`;

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Please sign in to use the helper." }, { status: 401 });

  const { allowed, reason } = await checkUsageAllowed(userId);
  if (!allowed) {
    const msg = reason === "limit_reached" ? "Monthly usage limit reached." : "Your access has been restricted.";
    return NextResponse.json({ error: msg }, { status: reason === "limit_reached" ? 429 : 403 });
  }

  const body = (await request.json()) as { messages?: Msg[] };
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (messages.length === 0) return NextResponse.json({ error: "messages required" }, { status: 400 });

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: SYSTEM,
      messages,
    });
    const reply = res.content[0]?.type === "text" ? res.content[0].text : "";
    void logUsage({ userId, feature: "code/chat", tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens });
    return NextResponse.json({ reply: reply || "Sorry — please try again." });
  } catch (err) {
    console.error("[code/chat] Claude error:", err);
    return NextResponse.json({ error: "Failed to generate a response." }, { status: 502 });
  }
}
