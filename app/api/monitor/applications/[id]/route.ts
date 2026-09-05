import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { requireProvisionedApi } from "@/lib/auth/requireProvisioned";
import { createServiceClient } from "@/lib/supabase/service";
import {
  normaliseText, normaliseJobUrl, statusChange, isApplicationStatus,
  APP_LINE_MAX, APP_DOC_MAX,
} from "@/lib/monitor/applications";
import { isValidEntryDate, todayISO } from "@/lib/monitor/skills";
import type { MonitorApplication, MonitorApplicationEvent } from "@/types/monitor";

// Editing one application: its documents, and its status.
//
// This route is the ONLY writer of application status. `monitor_applications.
// status` (the current stage) and `monitor_application_events` (the history)
// must never disagree, and they are built together by `statusChange` — see
// migration 039 for why both exist.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

// PATCH /api/monitor/applications/[id]
//   documents: { company?, role_title?, applied_on?, job_description?,
//                cover_letter?, resume_text?, notes? }
//   status:    { status, status_note?, occurred_on? }
//   → { application, event? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "monitorDocs");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};

  // Text fields: `undefined` means "not touched", so clearing a field needs an
  // explicit empty string rather than being impossible to express.
  if (body.company !== undefined) {
    const v = normaliseText(body.company, APP_LINE_MAX);
    if (!v) return NextResponse.json({ error: "A company name, at least." }, { status: 400 });
    patch.company = v;
  }
  if (body.role_title !== undefined) {
    const v = normaliseText(body.role_title, APP_LINE_MAX);
    if (!v) return NextResponse.json({ error: "A role title, at least." }, { status: 400 });
    patch.role_title = v;
  }
  if (body.applied_on !== undefined) {
    if (!isValidEntryDate(body.applied_on)) {
      return NextResponse.json({ error: "Pick a real date, today or earlier." }, { status: 400 });
    }
    patch.applied_on = body.applied_on;
  }
  for (const field of ["job_description", "notes"] as const) {
    if (body[field] !== undefined) patch[field] = normaliseText(body[field], APP_DOC_MAX);
  }
  // An unusable link is stored as null rather than rejected: losing the whole
  // edit because a pasted URL was malformed would be a worse trade than losing
  // the link.
  if (body.job_url !== undefined) patch.job_url = normaliseJobUrl(body.job_url);

  // Attaching (or detaching) the document version that was sent. `null` clears
  // it; a string is trusted to the extent that the FK enforces it — a bad id is
  // rejected by the database rather than silently stored.
  for (const field of ["resume_version_id", "cover_letter_version_id"] as const) {
    if (body[field] === null) patch[field] = null;
    else if (typeof body[field] === "string") patch[field] = body[field];
  }

  // A status change is two writes, built as a pair.
  const changingStatus = body.status !== undefined;
  if (changingStatus && !isApplicationStatus(body.status)) {
    return NextResponse.json({ error: "That isn't one of the five statuses." }, { status: 400 });
  }

  const occurredOn = body.occurred_on === undefined ? todayISO() : body.occurred_on;
  if (changingStatus && !isValidEntryDate(occurredOn)) {
    return NextResponse.json({ error: "Pick a real date, today or earlier." }, { status: 400 });
  }

  if (!changingStatus && Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  try {
    const db = createServiceClient();

    let eventRow: MonitorApplicationEvent | null = null;

    if (changingStatus && isApplicationStatus(body.status) && isValidEntryDate(occurredOn)) {
      const change = statusChange({
        applicationId: id,
        userId,
        status:        body.status,
        note:          typeof body.status_note === "string" ? body.status_note : null,
        occurredOn,
      });
      Object.assign(patch, change.patch);

      // The event goes in first. If the column update then fails, the history
      // has an entry the row hasn't caught up to — recoverable and visible. The
      // other order would silently change the status with no record of when.
      const { data, error } = await db
        .from("monitor_application_events").insert(change.event).select("*").single();
      if (error) throw error;
      eventRow = data as MonitorApplicationEvent;
    } else {
      patch.updated_at = new Date().toISOString();
    }

    const { data, error } = await db
      .from("monitor_applications")
      .update(patch)
      .eq("id", id).eq("user_id", userId)
      .select("*").single();
    if (error) throw error;

    return NextResponse.json({ application: data as MonitorApplication, event: eventRow });
  } catch (e) {
    console.error("[monitor/applications] update failed:", e);
    return NextResponse.json({ error: "Couldn't save that change." }, { status: 502 });
  }
}

// DELETE /api/monitor/applications/[id] → { ok }
//
// A real delete, unlike a skill's archive. An application recorded by mistake
// carries no history worth keeping, and leaving it would overstate how much you
// have sent — which is the number this view exists to report honestly. The
// history rows go with it via ON DELETE CASCADE.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  // Privacy pass: this surface holds personal material and is off by
  // default (migration 050). RLS stops the browser reaching the tables
  // and bucket directly; this stops our own service-role client, which
  // bypasses RLS entirely.
  const denied = await requireProvisionedApi(userId, "monitorDocs");
  if (denied) return denied;

  const { id } = await params;

  try {
    const db = createServiceClient();
    const { error } = await db
      .from("monitor_applications").delete()
      .eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[monitor/applications] delete failed:", e);
    return NextResponse.json({ error: "Couldn't remove that application." }, { status: 502 });
  }
}
