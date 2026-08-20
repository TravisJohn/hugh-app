import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { normaliseBody, normaliseRef, isBlank, sortNotes } from "@/lib/margin/notes";
import { isMarginSurface, type MarginNote } from "@/types/margin";

// The margin: one plain-text note per learner per thing-being-read.
//
// Spends nothing. Cloud Skills is a zero-runtime-AI surface by design, and the
// pad must not be what changes that — there is no model call anywhere in this
// file and no logUsage, because there is nothing to log.
//
// The single-note read is deliberately absent: a service page is already a
// server component, so it fetches its own note directly (lib/margin/server.ts)
// and hands it to the pad as an initial value. A second round-trip would put a
// loading spinner on a page whose whole promise is being fast.

const unauth = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

/** Every request names a surface; an unknown one never reaches the table. */
function readSurface(request: NextRequest): string | null {
  const surface = request.nextUrl.searchParams.get("surface");
  return isMarginSurface(surface) ? surface : null;
}

// GET /api/margin?surface=cloud → { notes }
//
// Everything this learner has written on that surface, newest first — the
// review list. Sorted here through the same pure helper the UI uses, so the
// order can't differ between a fresh load and a local edit.
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const surface = readSurface(request);
  if (!surface) return NextResponse.json({ error: "Unknown surface." }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("learner_notes").select("*")
      .eq("user_id", userId).eq("surface", surface);
    if (error) throw error;

    return NextResponse.json({ notes: sortNotes((data ?? []) as MarginNote[]) });
  } catch (e) {
    console.error("[margin] list failed:", e);
    return NextResponse.json({ error: "Couldn't load your notes." }, { status: 502 });
  }
}

// PUT /api/margin { surface, ref_id, ref_label, ref_href, body } → { note }
//
// Upsert on (user_id, surface, ref_id) — a margin is one growing page per
// thing, not a stack of separate jots, so saving always writes the same row.
//
// A blank body DELETES the row and answers { note: null }. Opening a service,
// thinking about it and typing nothing should leave no trace; without this the
// review list slowly fills with cards that say nothing.
//
// The two display snapshots are rewritten on every save, which is what lets a
// renamed service heal itself the next time you touch the note.
export async function PUT(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isMarginSurface(body.surface)) {
    return NextResponse.json({ error: "Unknown surface." }, { status: 400 });
  }

  const ref = normaliseRef(body);
  if (!ref) return NextResponse.json({ error: "Bad reference." }, { status: 400 });

  const text = normaliseBody(body.body);

  try {
    const db = createServiceClient();

    if (isBlank(text)) {
      const { error } = await db
        .from("learner_notes").delete()
        .eq("user_id", userId).eq("surface", body.surface).eq("ref_id", ref.ref_id);
      if (error) throw error;
      return NextResponse.json({ note: null });
    }

    const { data, error } = await db
      .from("learner_notes")
      .upsert({
        user_id: userId,
        surface: body.surface,
        ...ref,
        body: text,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,surface,ref_id" })
      .select("*").single();
    if (error) throw error;

    return NextResponse.json({ note: data as MarginNote });
  } catch (e) {
    console.error("[margin] save failed:", e);
    return NextResponse.json({ error: "Couldn't save that note." }, { status: 502 });
  }
}

// DELETE /api/margin?surface=cloud&refId=aws/s3 → { ok }
//
// Throwing a note away from the review list, where you can see the whole thing
// you are discarding. Clearing the pad does the same via PUT; this exists so
// the list doesn't have to open a note to get rid of it.
export async function DELETE(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return unauth();

  const surface = readSurface(request);
  if (!surface) return NextResponse.json({ error: "Unknown surface." }, { status: 400 });

  const refId = request.nextUrl.searchParams.get("refId");
  if (!refId) return NextResponse.json({ error: "refId required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { error } = await db
      .from("learner_notes").delete()
      .eq("user_id", userId).eq("surface", surface).eq("ref_id", refId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[margin] delete failed:", e);
    return NextResponse.json({ error: "Couldn't remove that note." }, { status: 502 });
  }
}
