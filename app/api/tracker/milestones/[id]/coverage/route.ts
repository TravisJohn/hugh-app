import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { learningPointsPrompt, parseLearningPoints } from "@/lib/claude/prompts";
import { logSafeError } from "@/lib/observability/log";
import { checkUsageAllowed, logUsage } from "@/lib/usage";
import { normalizeCoverage } from "@/utils/coverage";
import { type LearningPoint, type PointStatus } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model for this route — see CLAUDE.md "Model Selection". Kept in one place so
// the API call and the usage log can never disagree about what was billed.
const MODEL = "claude-sonnet-4-6";

interface MilestoneRow {
  id:              string;
  title:           string;
  summary:         string;
  learning_points: LearningPoint[] | null;
  coverage:        unknown; // legacy or current shape — normalized on read
  tracks:          { user_id: string; topic_description: string } | null;
}

async function loadOwnedMilestone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id:       string,
  userId:   string,
): Promise<MilestoneRow | null> {
  const { data } = await supabase
    .from("milestones")
    .select("id, title, summary, learning_points, coverage, tracks!track_id!inner(user_id, topic_description)")
    .eq("id", id)
    .single();
  const row = data as unknown as MilestoneRow | null;
  if (!row || row.tracks?.user_id !== userId) return null;
  return row;
}

/**
 * Generate the learning-points checklist for a milestone if it doesn't have one
 * yet.
 *
 * Returns null when the model's response could not be trusted, rather than
 * writing a partial one. An empty rail reads as "this milestone has no key
 * ideas", which is a different sentence from "we could not build the
 * checklist" — and only one of them is true. Nothing is written on that path,
 * so opening the card again retries cleanly.
 *
 * Tokens are logged either way: a discarded response still cost money.
 */
async function ensureLearningPoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ms:       MilestoneRow,
  userId:   string,
): Promise<LearningPoint[] | null> {
  if (ms.learning_points && ms.learning_points.length > 0) return ms.learning_points;

  const topic = ms.tracks?.topic_description ?? ms.title;
  const res = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 500,
    messages:   [{ role: "user", content: learningPointsPrompt(topic, ms.title, ms.summary) }],
  });
  void logUsage({ userId, model: MODEL, feature: "tracker/points", tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens });

  const raw = res.content[0]?.type === "text" ? res.content[0].text : "{}";

  let texts: string[];
  try {
    texts = parseLearningPoints(raw);
  } catch (err) {
    logSafeError("tracker/points parse", err, [topic, ms.title]);
    return null;
  }

  // Ids are POSITIONAL and externally referenced — `milestones.coverage`,
  // `point_status_events.point_id` and `milestone_entries.point_id` all point
  // at them. They are assigned once, here, and must never be renumbered: doing
  // so would silently reattach a learner's diary entries and stuck-flags to
  // different ideas. Any future re-ordering has to move the array and FREEZE
  // the ids, not recompute them.
  const points: LearningPoint[] = texts.map((text, i) => ({ id: `p${i + 1}`, text }));

  const { error } = await supabase
    .from("milestones")
    .update({ learning_points: points })
    .eq("id", ms.id);

  if (error) {
    logSafeError("tracker/points write", error, [topic, ms.title]);
    return null;
  }
  return points;
}

// ── GET: return checklist (generating once if missing) + cached coverage ────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const ms = await loadOwnedMilestone(supabase, id, userId);
  if (!ms) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { allowed } = await checkUsageAllowed(userId);
  // If usage is blocked, still return whatever points already exist (no new call).
  const points = allowed ? await ensureLearningPoints(supabase, ms, userId) : (ms.learning_points ?? []);

  // A null here is a failure, not an empty checklist, and it gets its own
  // status so the rail can say so instead of rendering as "nothing to learn".
  if (points === null) {
    return NextResponse.json(
      {
        error: "The checklist for this milestone could not be built. Reopen the card to try again.",
        coverage: normalizeCoverage(ms.coverage),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ learningPoints: points, coverage: normalizeCoverage(ms.coverage) });
}

const VALID_STATUSES = new Set<PointStatus>(["understood", "bookmarked", "stuck"]);

// ── POST: persist the learner's self-assessment ─────────────────────────────
// Coverage is a self-assessment the learner controls — they flag each idea as
// understood / bookmarked-for-later / still-stuck. We validate the ids against
// the milestone's checklist and the status values, then store them. No AI
// judgement is involved, and this never gates mastery.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { statuses } = (await request.json().catch(() => ({}))) as { statuses?: Record<string, string> };
  if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) {
    return NextResponse.json({ error: "statuses must be an object" }, { status: 400 });
  }

  const supabase = await createClient();

  const ms = await loadOwnedMilestone(supabase, id, userId);
  if (!ms) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only accept ids that belong to this milestone's checklist and valid statuses.
  const validIds = new Set((ms.learning_points ?? []).map(p => p.id));
  const clean: Record<string, PointStatus> = {};
  for (const [pid, val] of Object.entries(statuses)) {
    if (validIds.has(pid) && VALID_STATUSES.has(val as PointStatus)) clean[pid] = val as PointStatus;
  }
  const coverage = { statuses: clean, updatedAt: new Date().toISOString() };

  // Persist the current snapshot (what the board/drawer/card read).
  await supabase.from("milestones").update({ coverage }).eq("id", id);

  // Append-only history: log every actual transition for future coaching. The
  // snapshot above is the source of truth for the UI; this is best-effort and
  // never blocks the learner's save. (See migration 021_point_status_events.)
  const prev = normalizeCoverage(ms.coverage)?.statuses ?? {};
  const changedIds = new Set([...Object.keys(prev), ...Object.keys(clean)]);
  const events = [...changedIds]
    .filter(pid => (prev[pid] ?? null) !== (clean[pid] ?? null))
    .map(pid => ({
      user_id:      userId,
      milestone_id: id,
      point_id:     pid,
      from_status:  prev[pid] ?? null,
      to_status:    clean[pid] ?? null,
    }));
  if (events.length > 0) {
    await supabase.from("point_status_events").insert(events);
  }

  return NextResponse.json({ learningPoints: ms.learning_points ?? [], coverage });
}
