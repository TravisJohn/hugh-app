import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { isMonitorFeature } from "@/lib/monitor/features";
import { todayISO } from "@/lib/monitor/skills";
import type { ActivityEvent } from "@/types/monitor";

// The Usage view's read and write.
//
// No AI, no usage logging: recording that a surface was opened costs nothing,
// and this table is deliberately not `usage_logs` — see migration 044.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

// POST /api/monitor/activity { feature } → { ok }
//
// One row per learner per surface per day; a repeat increments `hits` rather
// than inserting. The day is decided HERE, in UTC, not by the client: a browser
// clock that is wrong or a timezone ahead would otherwise shade the wrong cell.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  // Not an error worth reporting. /code and /code/drill are open to anonymous
  // visitors, so this route is pinged by people with no account at all; there
  // is simply nobody to record it against.
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { feature?: unknown };
  if (!isMonitorFeature(body.feature)) {
    return NextResponse.json({ error: "Unknown surface." }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    // Upsert on the unique key, incrementing the counter. Done as an RPC-free
    // read-then-write because PostgREST cannot express `hits = hits + 1` in an
    // upsert; the race window is one learner refreshing one page twice in the
    // same instant, and losing a hit there costs nothing the grid can show.
    const { data: existing } = await db
      .from("activity_events")
      .select("id, hits")
      .eq("user_id", userId).eq("feature", body.feature).eq("event_date", todayISO())
      .maybeSingle();

    if (existing) {
      await db.from("activity_events")
        .update({ hits: (existing.hits as number) + 1 })
        .eq("id", existing.id);
    } else {
      await db.from("activity_events").insert({
        user_id:    userId,
        feature:    body.feature,
        event_date: todayISO(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Logged, never surfaced. A failed usage write must not become an error
    // banner over someone's learning session.
    console.error("[monitor/activity] record failed:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

// GET /api/monitor/activity → { events, seededAt }
//
// Flat rows; the grid is derived client-side through the same bucketing every
// other Monitor heatmap uses.
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("activity_events")
      .select("feature, event_date, hits")
      .eq("user_id", userId)
      .order("event_date", { ascending: false })
      .limit(8000);
    if (error) throw error;

    return NextResponse.json({ events: (data ?? []) as ActivityEvent[] });
  } catch (e) {
    console.error("[monitor/activity] load failed:", e);
    return NextResponse.json({ error: "Couldn't load your usage." }, { status: 502 });
  }
}
