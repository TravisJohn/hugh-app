import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Logs one cell check (pass or fail) for the current learner. Called
 * fire-and-forget from DrillMock the instant a check resolves — never blocks
 * the run flow, and a failed insert here (including the table not existing
 * yet, if migration 029 hasn't been applied) is swallowed rather than
 * surfaced, same as case_attempts and code_drills.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    packId?: string;
    cellId?: string;
    passed?: boolean;
    usedRef?: boolean;
  };

  const { packId, cellId, passed } = body;
  if (!packId || typeof packId !== "string" || !cellId || typeof cellId !== "string" || typeof passed !== "boolean") {
    return NextResponse.json({ error: "packId, cellId and passed are required" }, { status: 400 });
  }

  const { error } = await supabase.from("code_drill_attempts").insert({
    user_id: user.id,
    pack_id: packId,
    cell_id: cellId,
    passed,
    used_ref: body.usedRef ?? false,
  });

  if (error) {
    console.error("[code/attempts] insert error:", error.message);
    return NextResponse.json({ error: "Failed to log attempt" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
