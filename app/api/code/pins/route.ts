import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

// Pinned thoughts for the Code drill — personal notes a learner pins to a step.
// Server-side only; every op is scoped to the authenticated user_id. No LLM, so
// no usage gate — just auth. Best-effort: on a DB error the drill still works,
// pins just don't persist that round.

interface PinRow { id: string; card_id: string; text: string }

// GET /api/code/pins?pack=<packId> → this user's pins for that pack.
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const packId = request.nextUrl.searchParams.get("pack");
  if (!packId) return NextResponse.json({ error: "pack required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("pinned_thoughts")
      .select("id, card_id, text")
      .eq("user_id", userId)
      .eq("pack_id", packId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ pins: (data ?? []) as PinRow[] });
  } catch (e) {
    console.error("[code/pins] list failed:", e);
    return NextResponse.json({ pins: [] });
  }
}

// POST /api/code/pins { pack_id, card_id, text } → create, returns the new pin.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { pack_id?: string; card_id?: string; text?: string };
  const pack_id = body.pack_id?.trim();
  const card_id = body.card_id?.trim();
  const text = body.text?.trim().slice(0, 4000);
  if (!pack_id || !card_id || !text) return NextResponse.json({ error: "pack_id, card_id and text required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("pinned_thoughts")
      .insert({ user_id: userId, pack_id, card_id, text })
      .select("id, card_id, text")
      .single();
    if (error) throw error;
    return NextResponse.json({ pin: data as PinRow });
  } catch (e) {
    console.error("[code/pins] create failed:", e);
    return NextResponse.json({ error: "Couldn't pin that just now." }, { status: 502 });
  }
}

// DELETE /api/code/pins?id=<pinId> → remove one of this user's pins.
export async function DELETE(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const db = createServiceClient();
    // user_id in the filter ensures a learner can only delete their own pin.
    const { error } = await db.from("pinned_thoughts").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[code/pins] delete failed:", e);
    return NextResponse.json({ error: "Couldn't remove that just now." }, { status: 502 });
  }
}
