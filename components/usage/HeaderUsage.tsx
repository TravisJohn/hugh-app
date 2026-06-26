import { createClient } from "@/lib/supabase/server";
import { getUsageSummary } from "@/lib/usage";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  : n >= 1_000    ? `${Math.round(n / 1_000)}k`
  : `${n}`;

/**
 * Monthly token-usage gauge for page headers — a horizontal "temperature" bar
 * that warms (sky → amber → red) as the learner's monthly token allowance fills.
 * Self-contained: resolves the signed-in user and fetches their usage, so pages
 * just drop <HeaderUsage /> next to the username.
 */
export default async function HeaderUsage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { tokens } = await getUsageSummary(user.id);

  const barColor =
    tokens.pct >= 100 ? "bg-red-500"
    : tokens.pct >= 90 ? "bg-red-400"
    : tokens.pct >= 75 ? "bg-amber-400"
    : "bg-sky-500";

  return (
    <div
      className="hidden sm:flex items-center gap-2"
      title={`${tokens.used.toLocaleString()} of ${tokens.limit.toLocaleString()} monthly tokens used`}
    >
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${tokens.pct}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-slate-500">
        {fmt(tokens.used)} / {fmt(tokens.limit)}
      </span>
    </div>
  );
}
