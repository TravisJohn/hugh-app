import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { requireProvisionedApi } from "@/lib/auth/requireProvisioned";
import { createServiceClient } from "@/lib/supabase/service";
import { normaliseText, normaliseJobUrl, statusChange, APP_LINE_MAX, APP_DOC_MAX } from "@/lib/monitor/applications";
import { isValidEntryDate, todayISO } from "@/lib/monitor/skills";
import type { MonitorApplication, MonitorApplicationEvent } from "@/types/monitor";

// Monitor Applications: where you applied, what you sent, and where each one
// stands. No AI on this route — nothing is generated, scored or judged, so
// there is no model to pick and no usage to log.
//
// This is the surface that widens what Hugh *holds* rather than what Hugh
// *teaches*: none of this text is ever sent to a model, which is why the topic
// gate has nothing to do here.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

// GET /api/monitor/applications → { applications, events } as FLAT rows.
//
// Both in one fetch: the list needs the applications, the stat tiles and the
// timeline need the events, and every one of them is on screen at once.
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "monitorDocs");
  if (denied) return denied;

  try {
    const db = createServiceClient();
    const [{ data: apps, error: e1 }, { data: events, error: e2 }] = await Promise.all([
      db.from("monitor_applications").select("*").eq("user_id", userId)
        .order("applied_on", { ascending: false }),
      db.from("monitor_application_events").select("*").eq("user_id", userId)
        .order("occurred_on", { ascending: true })
        .limit(5000),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    return NextResponse.json({
      applications: (apps   ?? []) as MonitorApplication[],
      events:       (events ?? []) as MonitorApplicationEvent[],
    });
  } catch (e) {
    console.error("[monitor/applications] load failed:", e);
    return NextResponse.json({ error: "Couldn't load your applications." }, { status: 502 });
  }
}

// POST /api/monitor/applications { company, role_title, applied_on?, … }
//   → { application, event }
//
// Creating an application also opens its history with an "applied" event, so no
// application ever exists with a status and an empty timeline. Both writes come
// from `statusChange`, the one place that builds the pair.
//
// Duplicates are NOT collapsed the way skills are: applying twice to the same
// company for the same role is a real thing that happens, months apart, and
// merging them would destroy the record of both.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "monitorDocs");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const company   = normaliseText(body.company,    APP_LINE_MAX);
  const roleTitle = normaliseText(body.role_title, APP_LINE_MAX);
  if (!company || !roleTitle) {
    return NextResponse.json({ error: "A company and a role title, at least." }, { status: 400 });
  }

  const appliedOn = body.applied_on === undefined ? todayISO() : body.applied_on;
  if (!isValidEntryDate(appliedOn)) {
    return NextResponse.json({ error: "Pick a real date, today or earlier." }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("monitor_applications")
      .insert({
        user_id:         userId,
        company,
        role_title:      roleTitle,
        status:          "applied",
        applied_on:      appliedOn,
        job_url:         normaliseJobUrl(body.job_url),
        job_description: normaliseText(body.job_description, APP_DOC_MAX),
        notes:           normaliseText(body.notes,           APP_DOC_MAX),
      })
      .select("*").single();
    if (error) throw error;

    const application = data as MonitorApplication;
    const { event } = statusChange({
      applicationId: application.id,
      userId,
      status:        "applied",
      note:          typeof body.status_note === "string" ? body.status_note : null,
      occurredOn:    appliedOn,
    });

    const { data: eventRow, error: eventErr } = await db
      .from("monitor_application_events").insert(event).select("*").single();
    // The application is already saved. A failed opening event is a gap in the
    // history, not a lost application, so it is reported and the application is
    // still returned rather than being rolled back out from under the learner.
    if (eventErr) console.error("[monitor/applications] opening event failed:", eventErr);

    return NextResponse.json(
      { application, event: (eventRow ?? null) as MonitorApplicationEvent | null },
      { status: 201 },
    );
  } catch (e) {
    console.error("[monitor/applications] create failed:", e);
    return NextResponse.json({ error: "Couldn't save that application." }, { status: 502 });
  }
}
