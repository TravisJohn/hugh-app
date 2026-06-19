import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Action = "approve" | "block" | "unblock" | "set_pro" | "set_free" | "reset_usage";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // Verify the requesting user is an admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const body = (await request.json()) as { action: Action };
  const { action } = body;

  const service = createServiceClient();

  const updates: Record<string, unknown> = {};

  switch (action) {
    case "approve":      updates.approved   = true;              break;
    case "block":        updates.is_blocked = true;              break;
    case "unblock":      updates.is_blocked = false;
                         updates.approved   = true;              break;
    case "set_pro":      updates.plan       = "pro";             break;
    case "set_free":     updates.plan       = "free";            break;
    case "reset_usage":  updates.usage_reset_at = new Date().toISOString(); break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await service
    .from("profiles")
    .update(updates)
    .eq("user_id", userId);

  if (error) {
    console.error("[admin/users] Update failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
