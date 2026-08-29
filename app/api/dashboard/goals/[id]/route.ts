import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { logSafeError } from "@/lib/observability/log";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { error } = await supabase
    .from("learning_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    logSafeError("goals/delete", error);
    return NextResponse.json({ error: "Could not delete goal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
