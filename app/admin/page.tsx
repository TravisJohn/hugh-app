import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Zap, DollarSign, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { estimateCost, DEFAULT_MONTHLY_TOKEN_LIMIT } from "@/lib/usage";
import AdminActions from "./AdminActions";

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
  if (isAdmin)    return badge("Admin",   "bg-violet-500/20 text-violet-300");
  if (isBlocked)  return badge("Blocked", "bg-red-500/15 text-red-400");
  if (approved)   return badge("Active",  "bg-green-500/15 text-green-400");
  return badge("Pending", "bg-amber-500/15 text-amber-400");
}

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}k`
    : String(n);
}

export default async function AdminPage() {
  // Verify admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: selfProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();
  if (!selfProfile?.is_admin) redirect("/home");

  // Fetch all data via service role
  const service    = createServiceClient();
  const monthStart = startOfMonth();

  const [
    { data: { users: authUsers } },
    { data: profiles },
    { data: usageLogs },
  ] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 200 }),
    service.from("profiles").select("*"),
    service.from("usage_logs")
      .select("user_id, tokens_in, tokens_out, tts_chars, created_at")
      .gte("created_at", monthStart),
  ]);

  // Build lookup maps
  const profileMap = new Map((profiles ?? []).map(p => [p.user_id as string, p]));

  // Per-user usage totals (respecting usage_reset_at)
  const usageMap = new Map<string, { tokensIn: number; tokensOut: number; ttsChars: number }>();
  for (const log of usageLogs ?? []) {
    const p = profileMap.get(log.user_id as string);
    const resetAt = p?.usage_reset_at as string | null ?? null;
    const effectiveStart = resetAt && resetAt > monthStart ? resetAt : monthStart;
    if ((log.created_at as string) < effectiveStart) continue;

    const cur = usageMap.get(log.user_id as string) ?? { tokensIn: 0, tokensOut: 0, ttsChars: 0 };
    usageMap.set(log.user_id as string, {
      tokensIn:  cur.tokensIn  + (log.tokens_in  as number ?? 0),
      tokensOut: cur.tokensOut + (log.tokens_out as number ?? 0),
      ttsChars:  cur.ttsChars  + (log.tts_chars  as number ?? 0),
    });
  }

  // Merge into rows
  const rows = (authUsers ?? []).map(u => {
    const p   = profileMap.get(u.id);
    const use = usageMap.get(u.id) ?? { tokensIn: 0, tokensOut: 0, ttsChars: 0 };
    return {
      id:        u.id,
      email:     u.email ?? "—",
      createdAt: u.created_at,
      plan:      (p?.plan ?? "free") as string,
      approved:  (p?.approved ?? false) as boolean,
      isBlocked: (p?.is_blocked ?? false) as boolean,
      isAdmin:   (p?.is_admin ?? false) as boolean,
      limit:     (p?.token_limit as number | null) ?? DEFAULT_MONTHLY_TOKEN_LIMIT,
      ...use,
      cost: estimateCost(use.tokensIn, use.tokensOut, use.ttsChars),
    };
  });

  // Summary stats
  const totalTokens = rows.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  const totalCost   = rows.reduce((s, r) => s + r.cost, 0);
  const pending     = rows.filter(r => !r.approved && !r.isBlocked && !r.isAdmin).length;
  const activeUsers = rows.filter(r => (usageMap.get(r.id)?.tokensIn ?? 0) > 0).length;

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-slate-100">

      {/* Header */}
      <header className="border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft size={14} />
            Dashboard
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-serif text-lg font-semibold">Hugh Admin</span>
        </div>
        <span className="text-xs text-slate-600">{new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
      </header>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total users",      value: rows.length,         icon: Users,        color: "text-sky-400",    bg: "bg-sky-500/10"    },
            { label: "Pending approval", value: pending,             icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10"  },
            { label: "Tokens this month",value: fmt(totalTokens),    icon: Zap,          color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "Est. cost (USD)",  value: `$${totalCost.toFixed(2)}`, icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10"  },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-2">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
                <Icon size={18} className={color} />
              </div>
              <p className="text-2xl font-bold text-slate-100">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* User table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <p className="font-semibold text-slate-200">Users</p>
            <p className="text-xs text-slate-600">{activeUsers} active this month</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-xs text-slate-600 uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-right px-4 py-3 font-medium">Tokens In</th>
                  <th className="text-right px-4 py-3 font-medium">Tokens Out</th>
                  <th className="text-right px-4 py-3 font-medium">TTS Chars</th>
                  <th className="text-right px-4 py-3 font-medium">Est. Cost</th>
                  <th className="text-left px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {rows.map(r => {
                  const overLimit = !r.isAdmin && r.plan !== "pro" && (r.tokensIn + r.tokensOut) >= r.limit;
                  return (
                    <tr key={r.id} className={`transition-colors hover:bg-slate-800/20 ${r.isBlocked ? "opacity-50" : ""}`}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-slate-200 font-medium">{r.email}</p>
                          <p className="text-xs text-slate-600">
                            {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">{statusBadge(r.approved, r.isBlocked, r.isAdmin)}</td>
                      <td className="px-4 py-4">
                        <span className={`text-xs font-semibold ${r.plan === "pro" ? "text-amber-400" : "text-slate-500"}`}>
                          {r.plan}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-slate-400 tabular-nums">{fmt(r.tokensIn)}</td>
                      <td className="px-4 py-4 text-right text-slate-400 tabular-nums">{fmt(r.tokensOut)}</td>
                      <td className="px-4 py-4 text-right text-slate-400 tabular-nums">{fmt(r.ttsChars)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">
                        <span className={overLimit ? "text-red-400 font-semibold" : "text-slate-400"}>
                          ${r.cost.toFixed(3)}
                        </span>
                        {overLimit && (
                          <span className="ml-1.5 text-xs text-red-500">limit</span>
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
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-600 text-sm">
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
