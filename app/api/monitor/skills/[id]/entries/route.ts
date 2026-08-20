import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { normaliseSkillNote, normaliseEffort, isValidEntryDate, todayISO } from "@/lib/monitor/skills";
import type { MonitorSkillEntry } from "@/types/monitor";

// One entry = one session on a skill, with an optional diary line.
//
// There is no GET here on purpose: entries are returned with the skills in one
// fetch (GET /api/monitor/skills), because the list needs both together and a
// second round-trip per skill would make a six-skill page do seven requests.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

/** Confirms the skill exists and belongs to this user before writing under it. */
async function ownsSkill(
  db: ReturnType<typeof createServiceClient>,
  skillId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from("monitor_skills").select("id")
    .eq("id", skillId).eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

// POST /api/monitor/skills/[id]/entries { entry_date?, note?, effort? } → { entry }
//
// `entry_date` defaults to today and may be backdated — remembering on
// Wednesday that you studied on Monday is the normal case for a hand-kept
// record. It may not be in the future: a cell beyond the end of the grid can
// never be seen, so the tick would silently do nothing.
//
// `effort` is 1-5 and optional. An unusable value is stored as NULL rather than
// rejected: refusing to record a session because its rating was malformed would
// lose the fact that the session happened, which matters more than the rating.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const { id: skillId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    entry_date?: unknown; note?: unknown; effort?: unknown;
  };

  const entryDate = body.entry_date === undefined ? todayISO() : body.entry_date;
  if (!isValidEntryDate(entryDate)) {
    return NextResponse.json(
      { error: "Pick a real date, today or earlier." },
      { status: 400 },
    );
  }

  try {
    const db = createServiceClient();
    if (!await ownsSkill(db, skillId, userId)) {
      return NextResponse.json({ error: "No such skill." }, { status: 404 });
    }

    // user_id is written here as well as on the skill: monitor_skill_entries
    // carries it denormalised so its RLS policy reads one table (see 037).
    const { data, error } = await db
      .from("monitor_skill_entries")
      .insert({
        skill_id:   skillId,
        user_id:    userId,
        entry_date: entryDate,
        note:       normaliseSkillNote(body.note),
        effort:     normaliseEffort(body.effort),
      })
      .select("*").single();
    if (error) throw error;

    return NextResponse.json({ entry: data as MonitorSkillEntry }, { status: 201 });
  } catch (e) {
    console.error("[monitor/entries] create failed:", e);
    return NextResponse.json({ error: "Couldn't log that." }, { status: 502 });
  }
}

// DELETE /api/monitor/skills/[id]/entries?entryId=… → { ok }
//
// A mis-tick should be undoable. This is a real delete, not an archive: unlike
// a skill, a single wrong entry carries no history worth keeping, and leaving
// it would overstate the record — which is the one thing a record must not do.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const { id: skillId } = await params;
  const entryId = request.nextUrl.searchParams.get("entryId");
  if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { error } = await db
      .from("monitor_skill_entries")
      .delete()
      .eq("id", entryId).eq("skill_id", skillId).eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[monitor/entries] delete failed:", e);
    return NextResponse.json({ error: "Couldn't remove that entry." }, { status: 502 });
  }
}
