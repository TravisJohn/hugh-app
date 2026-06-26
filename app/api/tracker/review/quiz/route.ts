import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { checkUsageAllowed, logUsage } from "@/lib/usage";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface QuizQuestion {
  question:     string;
  options:      string[];
  correctIndex: number;
  explanation:  string;
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

  const body = (await request.json()) as { milestoneId?: string };
  if (!body.milestoneId) {
    return NextResponse.json({ error: "milestoneId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify ownership
  const { data: milestone } = await supabase
    .from("milestones")
    .select("id, title, tracks!track_id!inner(user_id)")
    .eq("id", body.milestoneId)
    .single();

  if (!milestone) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  // Fetch diary entries scoped to this milestone
  const { data: entries } = await supabase
    .from("milestone_entries")
    .select("title, body")
    .eq("milestone_id", body.milestoneId)
    .order("created_at", { ascending: true });

  if (!entries || entries.length === 0) {
    return NextResponse.json(
      { error: "No learning diary entries found. Add entries before starting the review quiz." },
      { status: 422 }
    );
  }

  const entriesText = entries
    .map((e, i) => `Entry ${i + 1}${e.title ? ` — ${e.title}` : ""}:\n${(e.body ?? "").slice(0, 2000)}`)
    .join("\n\n---\n\n");

  const prompt = `You are generating a review quiz to test a learner's understanding of what they have studied.

Topic: "${milestone.title}"

Learner's diary entries:
${entriesText}

Generate exactly 5 multiple-choice questions based ONLY on the content above.

Rules:
- Each question must test genuine conceptual understanding, not just word-for-word recall
- Each question has exactly 4 options; only one is correct
- The correct answer must be clearly supported by the learner's own notes
- Vary the difficulty and cover different ideas from the entries
- Include a 1-2 sentence explanation of why the correct answer is right

Return ONLY a valid JSON array — no markdown, no commentary:
[
  {
    "question": "...",
    "options": ["Option text A", "Option text B", "Option text C", "Option text D"],
    "correctIndex": 0,
    "explanation": "..."
  }
]`;

  try {
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 2048,
      messages:   [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("Non-text response from Claude");

    const raw       = block.text.trim().replace(/^```(?:json)?\n?|\n?```$/g, "").trim();
    const questions = JSON.parse(raw) as QuizQuestion[];

    if (!Array.isArray(questions) || questions.length !== 5) {
      throw new Error(`Expected 5 questions, got ${Array.isArray(questions) ? questions.length : "non-array"}`);
    }

    void logUsage({ userId, feature: "review/quiz", tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens });
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("[review/quiz] Generation failed:", err);
    return NextResponse.json({ error: "Failed to generate quiz. Please try again." }, { status: 500 });
  }
}
