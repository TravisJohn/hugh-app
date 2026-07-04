import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Saves one completed case attempt for the current learner. Called best-effort
 * from the client when the reveal is reached; there is no AI and no external
 * call here — just an RLS-scoped insert (user_id = auth.uid()).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    caseId?: string;
    choices?: Record<string, string>;
    flags?: Record<string, string>;
    heldCount?: number;
    batch?: string;
  };

  const { caseId, choices, flags } = body;
  if (
    !caseId ||
    typeof caseId !== "string" ||
    !choices ||
    typeof choices !== "object" ||
    !flags ||
    typeof flags !== "object"
  ) {
    return NextResponse.json(
      { error: "caseId, choices and flags are required" },
      { status: 400 },
    );
  }

  const heldCount = Math.max(0, Math.min(3, Math.trunc(body.heldCount ?? 0)));

  const { error } = await supabase.from("case_attempts").insert({
    user_id: user.id,
    case_id: caseId,
    batch: body.batch ?? null,
    choices,
    flags,
    held_count: heldCount,
  });

  if (error) {
    console.error("[cases/progress] insert error:", error.message);
    return NextResponse.json({ error: "Failed to save attempt" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
