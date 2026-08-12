import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { enforceUsageGate } from "@/lib/usage";
import { judgeTopicDomain } from "@/lib/learn/topic-domain-server";

// Entry-point domain gate: judge whether a topic is within Hugh's data &
// analytics domain before any track/session is built. The judge itself lives
// in lib/learn/topic-domain-server.ts so other server routes (e.g. the
// document-upload extract route) can call it in-process, without an HTTP
// round-trip through here.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usageGate = await enforceUsageGate(userId);
  if (usageGate) return usageGate;

  const body = (await request.json()) as { topic?: string };
  const topic = body.topic?.trim();
  if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const verdict = await judgeTopicDomain(topic);
  return NextResponse.json(verdict);
}
