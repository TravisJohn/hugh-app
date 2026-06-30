import { requireAdminPage } from "@/lib/auth/requireAdmin";

// Auth depends on cookies — never statically optimize this page.
export const dynamic = "force-dynamic";

export const metadata = { title: "Architecture · Hugh Admin" };

/**
 * Admin-gated host for the architecture dashboard. The visual UI is the same
 * standalone dashboard served as a static asset; it runs in "hosted" mode
 * (?hosted=1) so it pulls data from /api/architecture/data and chats via
 * /api/architecture/chat — both of which require admin auth server-side. The
 * static shell carries no secrets or data; everything sensitive is gated.
 */
export default async function ArchitecturePage() {
  await requireAdminPage();

  return (
    <iframe
      src="/admin-architecture/dashboard.html?hosted=1"
      title="Hugh architecture dashboard"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0 }}
    />
  );
}
