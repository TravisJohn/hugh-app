import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { normaliseSkillName, findDuplicateSkill } from "@/lib/monitor/skills";
import type { MonitorSkill, MonitorSkillEntry } from "@/types/monitor";

// Monitor Skills: the things a learner said they want to learn, and the days
// they actually touched them. No AI on this route — nothing here is generated
// or judged, so there is no model to pick and nothing to log usage for.
//
// Every op is scoped to the authenticated user_id via the service-role client,
// matching /api/notes/*.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

// GET /api/monitor/skills → { skills, entries } as FLAT rows.
//
// Entries are joined to skills client-side in lib/monitor/skills.ts, so there
// is one join implementation shared by the list, the heatmaps and the tests —
// rather than a grouped SQL query here and a second regrouping in the UI.
//
// Everything is returned rather than only the 16-week window: the window drives
// the grid, but "last touched in February" is a line the list still has to show
// for a skill that has gone quiet. A hand-kept diary is small enough that one
// fetch is cheaper than two; the cap is a guard, not a page, and it drops the
// oldest rows because those are the ones no view can reach.
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  try {
    const db = createServiceClient();
    const [{ data: skills, error: e1 }, { data: entries, error: e2 }] = await Promise.all([
      db.from("monitor_skills").select("*").eq("user_id", userId)
        .order("created_at", { ascending: true }),
      db.from("monitor_skill_entries").select("*").eq("user_id", userId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    return NextResponse.json({
      skills:  (skills  ?? []) as MonitorSkill[],
      entries: (entries ?? []) as MonitorSkillEntry[],
    });
  } catch (e) {
    console.error("[monitor/skills] load failed:", e);
    return NextResponse.json({ error: "Couldn't load your skills." }, { status: 502 });
  }
}

// POST /api/monitor/skills { name } → { skill, existing }
//
// Adding a skill you already track returns the one you have rather than
// creating a twin. Two rows differing only in capitalisation would split one
// learner's history across two heatmaps, each showing half the truth — and an
// archived match is revived rather than shadowed, so re-adding a skill you put
// down brings its record back with it.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = normaliseSkillName(body.name);
  if (!name) return NextResponse.json({ error: "Give the skill a name." }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data: existingRows, error: readErr } = await db
      .from("monitor_skills").select("*").eq("user_id", userId);
    if (readErr) throw readErr;

    const duplicate = findDuplicateSkill((existingRows ?? []) as MonitorSkill[], name);
    if (duplicate) {
      if (!duplicate.archived_at) {
        return NextResponse.json({ skill: duplicate, existing: true });
      }
      const { data: revived, error: reviveErr } = await db
        .from("monitor_skills")
        .update({ archived_at: null })
        .eq("id", duplicate.id).eq("user_id", userId)
        .select("*").single();
      if (reviveErr) throw reviveErr;
      return NextResponse.json({ skill: revived as MonitorSkill, existing: true });
    }

    const { data, error } = await db
      .from("monitor_skills")
      .insert({ user_id: userId, name })
      .select("*").single();
    if (error) throw error;

    return NextResponse.json({ skill: data as MonitorSkill, existing: false }, { status: 201 });
  } catch (e) {
    console.error("[monitor/skills] create failed:", e);
    return NextResponse.json({ error: "Couldn't add that skill." }, { status: 502 });
  }
}

// PATCH /api/monitor/skills { id, name?, archived? } → { skill }
//
// Archiving is the only removal Monitor offers. A skill you stopped working on
// is history, not a mistake: its entries survive, and un-archiving restores the
// whole record rather than an empty grid.
export async function PATCH(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    id?: string; name?: unknown; archived?: unknown;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = normaliseSkillName(body.name);
    if (!name) return NextResponse.json({ error: "Give the skill a name." }, { status: 400 });
    patch.name = name;
  }
  if (typeof body.archived === "boolean") {
    patch.archived_at = body.archived ? new Date().toISOString() : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("monitor_skills")
      .update(patch)
      .eq("id", body.id).eq("user_id", userId)
      .select("*").single();
    if (error) throw error;
    return NextResponse.json({ skill: data as MonitorSkill });
  } catch (e) {
    console.error("[monitor/skills] update failed:", e);
    return NextResponse.json({ error: "Couldn't update that skill." }, { status: 502 });
  }
}
