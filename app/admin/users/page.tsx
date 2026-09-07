import Link from "next/link";
import { ArrowLeft, Users, AlertTriangle } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { estimateCost, DEFAULT_MONTHLY_TOKEN_LIMIT } from "@/lib/usage";
import AdminActions from "../AdminActions";

// ── Users ───────────────────────────────────────────────────────────────────
//
// Accounts, approvals and per-learner spend. Moved off /admin, which had grown
// into a page where the user table crowded out everything else while telling
// the operator very little before launch.
//
// The per-row costing below is load-bearing and was a bug once: cost accrues
// PER ROW at that row's own model rate, because Hugh mixes models whose rates
// differ by up to 20x. Summing tokens first and applying one rate priced every
// Haiku call at Sonnet rates.

export const dynamic = "force-dynamic";

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function badge(label: string, color: string) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

function statusBadge(approved: boolean, isBlocked: boolean, isAdmin: boolean) {
  if (isAdmin)   return badge("Admin",   "bg-violet-500/20 text-violet-300");
  if (isBlocked) return badge("Blocked", "bg-red-500/15 text-red-400");
  if (approved)  return badge("Active",  "bg-green-500/15 text-green-400");
  return badge("Pending", "bg-amber-500/15 text-amber-400");
}

function fmt(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
       : n >= 1_000     ? `${(n / 1_000).toFixed(1)}k`
       : String(n);
}

interface UserUsage {
  tokensIn:  number;
  tokensOut: number;
  ttsChars:  number;
  cost:      number;
}
const EMPTY_USAGE: UserUsage = { tokensIn: 0, tokensOut: 0, ttsChars: 0, cost: 0 };

export default async function AdminUsersPage() {
  await requireAdminPage();

  const service    = createServiceClient();
  const monthStart = startOfMonth();

  const [
    { data: { users: authUsers } },
    { data: profiles },
    usageRes,
  ] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 200 }),
    service.from("profiles").select("*"),
    service.from("usage_logs")
      .select("user_id, tokens_in, tokens_out, tts_chars, model, created_at")
      .gte("created_at", monthStart),
  ]);

  // A dropped usage query must not render as "nobody spent anything".
  const usageFailed = usageRes.error !== null;
  const usageLogs   = usageRes.data ?? [];

  const profileMap = new Map((profiles ?? []).map(p => [p.user_id as string, p]));
  const usageMap   = new Map<string, UserUsage>();

  for (const log of usageLogs) {
    const p       = profileMap.get(log.user_id as string);
    const resetAt = (p?.usage_reset_at as string | null) ?? null;
    const effectiveStart = resetAt && resetAt > monthStart ? resetAt : monthStart;
    if ((log.created_at as string) < effectiveStart) continue;

    const tokensIn  = (log.tokens_in  as number) ?? 0;
    const tokensOut = (log.tokens_out as number) ?? 0;
    const ttsChars  = (log.tts_chars  as number) ?? 0;
    const rowCost   = estimateCost(tokensIn, tokensOut, ttsChars, log.model as string | null);

    const cur = usageMap.get(log.user_id as string) ?? EMPTY_USAGE;
    usageMap.set(log.user_id as string, {
      tokensIn:  cur.tokensIn  + tokensIn,
      tokensOut: cur.tokensOut + tokensOut,
      ttsChars:  cur.ttsChars  + ttsChars,
      cost:      cur.cost      + rowCost,
    });
  }

  const rows = (authUsers ?? []).map(u => {
    const p   = profileMap.get(u.id);
    const use = usageMap.get(u.id) ?? EMPTY_USAGE;
    return {
      id:        u.id,
      email:     u.email ?? "—",
      createdAt: u.created_at,
      plan:      (p?.plan ?? "free") as string,
      approved:  (p?.approved   ?? false) as boolean,
      isBlocked: (p?.is_blocked ?? false) as boolean,
      isAdmin:   (p?.is_admin   ?? false) as boolean,
      limit:     (p?.token_limit as number | null) ?? DEFAULT_MONTHLY_TOKEN_LIMIT,
      ...use,
    };
  });

  const pending     = rows.filter(r => !r.approved && !r.isBlocked && !r.isAdmin).length;
  const activeUsers = rows.filter(r => (usageMap.get(r.id)?.tokensIn ?? 0) > 0).length;

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-8 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft size={14} />
            Admin
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-serif text-lg font-semibold">Users</span>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <Users size={12} />
          {rows.length} total · {activeUsers} active this month
        </span>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-8 py-8">

        {pending > 0 && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-sm text-slate-300">
                <span className="font-semibold">
                  {pending} {pending === 1 ? "account is" : "accounts are"} waiting for approval.
                </span>{" "}
                <span className="text-slate-500">
                  They have verified their email and cannot reach any surface until approved.
                </span>
              </p>
            </div>
          </section>
        )}

        {usageFailed && (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
            <p className="text-sm text-slate-300">
              <span className="font-semibold">Usage data could not be loaded.</span>{" "}
              <span className="text-slate-500">
                The spend columns below are blank because the query failed, not
                because nothing was spent. Reload to try again.
              </span>
            </p>
          </section>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <p className="font-semibold text-slate-200">Accounts</p>
            <p className="text-xs text-slate-600">Spend is this calendar month</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Plan</th>
                  <th className="px-4 py-3 text-right font-medium">Tokens In</th>
                  <th className="px-4 py-3 text-right font-medium">Tokens Out</th>
                  <th className="px-4 py-3 text-right font-medium">TTS Chars</th>
                  <th className="px-4 py-3 text-right font-medium">Est. Cost</th>
                  <th className="px-6 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {rows.map(r => {
                  const overLimit =
                    !r.isAdmin && r.plan !== "pro" && (r.tokensIn + r.tokensOut) >= r.limit;
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-slate-800/20 ${r.isBlocked ? "opacity-50" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-200">{r.email}</p>
                        <p className="text-xs text-slate-600">
                          {new Date(r.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-4">{statusBadge(r.approved, r.isBlocked, r.isAdmin)}</td>
                      <td className="px-4 py-4">
                        <span className={`text-xs font-semibold ${r.plan === "pro" ? "text-amber-400" : "text-slate-500"}`}>
                          {r.plan}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-400">
                        {usageFailed ? "—" : fmt(r.tokensIn)}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-400">
                        {usageFailed ? "—" : fmt(r.tokensOut)}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-400">
                        {usageFailed ? "—" : fmt(r.ttsChars)}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums">
                        {usageFailed ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <>
                            <span className={overLimit ? "font-semibold text-red-400" : "text-slate-400"}>
                              ${r.cost.toFixed(3)}
                            </span>
                            {overLimit && <span className="ml-1.5 text-xs text-red-500">limit</span>}
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <AdminActions
                          userId={r.id}
                          approved={r.approved}
                          isBlocked={r.isBlocked}
                          isAdmin={r.isAdmin}
                          plan={r.plan}
                        />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-600">
                      No users yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
