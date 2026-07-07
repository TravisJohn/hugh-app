import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { checkUsageAllowed, logUsage } from "@/lib/usage";
import { SAMPLE_DRILL } from "@/lib/code/drillContent";
import { buildDrillPrompt, parseDrill, DRILL_SYSTEM, type DrillRequest } from "@/lib/code/generateDrill";

// Turns the learning/topic a user picked on /code/start into a runnable, pure-
// Python notebook drill. Sonnet — reasoning-heavy generation where quality
// matters (see Model Selection in CLAUDE.md). Server-side only. On any failure
// (auth, usage, generation, bad JSON) we return the sample drill with
// generated:false so the drill screen always has something to render.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const sample = (reason: string) =>
  NextResponse.json({ content: SAMPLE_DRILL, generated: false, reason });

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return sample("not-signed-in");

  const { allowed } = await checkUsageAllowed(userId);
  if (!allowed) return sample("usage-limit");

  const body = (await request.json().catch(() => ({}))) as Partial<DrillRequest>;
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) return sample("no-topic");

  const req: DrillRequest = {
    topic: topic.slice(0, 200),
    context: typeof body.context === "string" ? body.context.slice(0, 200) : undefined,
    focus: typeof body.focus === "string" ? body.focus.slice(0, 120) : undefined,
  };

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: DRILL_SYSTEM,
      messages: [{ role: "user", content: buildDrillPrompt(req) }],
    });
    void logUsage({ userId, feature: "code/generate-drill", tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens });

    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const content = parseDrill(text); // throws on any shape problem
    return NextResponse.json({ content, generated: true });
  } catch (err) {
    console.error("[code/generate-drill] falling back to sample:", err);
    return sample("generation-failed");
  }
}
