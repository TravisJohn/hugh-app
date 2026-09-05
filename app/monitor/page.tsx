import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import { hasSurface } from "@/lib/auth/requireProvisioned";
import { todayISO } from "@/lib/monitor/skills";
import MonitorShell from "@/components/monitor/MonitorShell";

// Monitor — the tracking surface. Three views under one shell: Skills,
// Applications, Usage. Auth-gated like the rest of the post-login app; all
// per-user data is fetched client-side by useMonitor through /api/monitor/*.
//
// Monitor is a record, not a teacher. Nothing on this route calls a model, so
// there is no model to name and no usage to log.
export default async function MonitorPage() {
  const supabase = await createClient();
  const { user } = await verifyUserAccess(supabase);

  // Privacy pass (migration 050). Résumés, cover letters and the applications
  // history are off by default; Skills and Your Usage are not gated, so Monitor
  // stays useful rather than disappearing. The database enforces the same rule
  // in RLS — this only decides what is worth drawing.
  const docsEnabled = await hasSurface(user.id, "monitorDocs");

  // The header's date is computed here rather than in the browser. Monitor
  // buckets days in UTC server-side, so a header rendered from the browser's
  // local date could read "Wed 17 Jun" while a tick lands on the 18th — the
  // banner has to agree with what actually gets recorded.
  const today = new Date(`${todayISO()}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

  // The shell reads the active tab from ?view=, and useSearchParams needs a
  // Suspense boundary above it.
  return (
    <Suspense fallback={<div className="h-screen bg-[#0A0F1E]" />}>
      <MonitorShell today={today} docsEnabled={docsEnabled} />
    </Suspense>
  );
}
