import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { enforceUsageGate } from "@/lib/usage";
import { judgeTopicDomain } from "@/lib/learn/topic-domain-server";
import { checkTopic, TOPIC_REJECTION_MESSAGE } from "@/lib/learn/topicInput";

// Entry-point domain gate: judge whether a topic is within Hugh's data &
// analytics domain before any track/session is built. The judge itself lives
// in lib/learn/topic-domain-server.ts so other server routes (e.g. the
// document-upload extract route) can call it in-process, without an HTTP
// round-trip through here.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usageGate = await enforceUsageGate(userId, "learn/topic-domain");
  if (usageGate) return usageGate;

  const body = (await request.json()) as { topic?: string };

  // The boundary. Normalises the typed topic to a single-line, bounded label
  // before it reaches a model — the client caps the field too, but a cap that
  // only runs in the browser is not a cap: this endpoint is reachable directly.
  const checked = checkTopic(body.topic ?? "");
  if (!checked.ok) {
    return NextResponse.json(
      { error: TOPIC_REJECTION_MESSAGE[checked.rejection] },
      { status: 400 },
    );
  }

  const verdict = await judgeTopicDomain(checked.topic, userId);
  return NextResponse.json(verdict);
}
