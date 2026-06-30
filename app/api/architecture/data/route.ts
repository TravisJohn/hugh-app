import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdmin";
import data from "@/lib/architecture/data.generated.json";

// Generated at build time (scripts/build-hosted.js); imported so it's bundled
// into the serverless function. Snapshot per deploy.
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(data);
}
