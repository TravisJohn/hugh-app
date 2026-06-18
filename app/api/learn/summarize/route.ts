import "server-only";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    topic: string;
    messages: { role: string; content: string }[];
  };

  const { topic, messages } = body;
  if (!topic || !messages?.length) {
    return NextResponse.json({ error: "Missing topic or messages" }, { status: 400 });
  }

  // Strip any synthetic welcome message (first assistant turn) before building the transcript
  const realMessages = messages[0]?.role === "assistant" ? messages.slice(1) : messages;

  const conversation = realMessages
    .map(m => `${m.role === "user" ? "Student" : "Hugh"}: ${m.content}`)
    .join("\n\n");

  const prompt = `You are reviewing a learning conversation about "${topic}".

CONVERSATION:
${conversation}

Write a SHORT narrative (3-4 sentences) describing how this conversation unfolded — what the student explored, what key ideas emerged, and how the discussion progressed. Write it as a flowing story, not a list.

Then choose ONE key takeaway that is most relevant and most impactful for the topic "${topic}". This should be the single insight the student should remember above all else.

Then generate a SHORT, specific title (4-7 words) that captures the MAIN concept discussed in this specific conversation — not just the general subject, but what was actually explored. Examples: "Partitioning Strategies for Large Fact Tables", "Why Idempotency Matters in Pipelines".

Return ONLY valid JSON with exactly these three fields:
{"story": "...", "takeaway": "...", "title": "..."}

Rules:
- "story" must be 3-4 flowing sentences, no bullet points
- "takeaway" must be a single concise sentence (20 words max)
- "title" must be 4-7 words, specific to what was discussed
- Do not use markdown inside the JSON values
- Return ONLY the JSON object, no fences, no commentary`;

  try {
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 512,
      messages:   [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      return NextResponse.json({ error: "Unexpected response type" }, { status: 500 });
    }

    const raw    = block.text.trim().replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(raw) as { story: string; takeaway: string; title?: string };

    return NextResponse.json({ story: parsed.story, takeaway: parsed.takeaway, title: parsed.title ?? null });
  } catch {
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
