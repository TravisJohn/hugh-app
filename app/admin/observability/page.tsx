import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, EyeOff, Activity } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  rollupOperations,
  buildCoverage,
  silentFailures,
  chatHealth,
  totals,
  CHAT_ANOMALY_THRESHOLD,
  CHAT_MIN_SAMPLE,
  type OperationEventRow,
  type OperationStats,
} from "@/lib/observability/rollup";

// ── Observability ───────────────────────────────────────────────────────────
//
// Operator view over `operation_events`. All arithmetic lives in
// lib/observability/rollup.ts (pure, tested); this file queries and formats.

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

/**
 * Rows are pulled and aggregated in memory rather than in SQL, which is fine at
 * Hugh's volume and needs no view. The cap exists so a runaway ask.chat cannot
 * pull the whole table into a page render — and if it is ever hit, the page
 * says so rather than quietly reporting a fraction of reality.
 */
const ROW_CAP = 5000;

// ── Formatting ──────────────────────────────────────────────────────────────

function pct(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 1)}%`;
}

function dur(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function badge(label: string, tone: string) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
  );
}

export default async function ObservabilityPage() {
  await requireAdminPage();

  const service = createServiceClient();
  // Server Component with force-dynamic: this renders once per request, so
  // "now" is a request timestamp, not a value that could shift between client
  // re-renders. The purity rule cannot tell the two apart.
  // eslint-disable-next-line react-hooks/purity
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  // The earliest row ever written. Everything before it predates instrumentation
  // and must be excluded from the coverage check — otherwise every goal created
  // before migration 047 counts as a ghost build and the alert is permanently,
  // uselessly red.
  const [{ data: events, error: eventsError }, { data: firstEvent }] = await Promise.all([
    service
      .from("operation_events")
      .select("operation, outcome, duration_ms, error_class")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),
    service
      .from("operation_events")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const telemetryStart = (firstEvent?.created_at as string | undefined) ?? null;
  const coverageStart  = telemetryStart && telemetryStart > windowStart ? telemetryStart : windowStart;

  // Goals eligible for the coverage check.
  //
  // 'awaiting_approval' is excluded on purpose: a document goal exists from the
  // moment its topic is extracted, but no build is attempted until the learner
  // approves it. Counting those as missing builds would report a ghost for
  // every goal simply waiting on a person.
  const { count: goalsCreated, error: goalsError } = await service
    .from("learning_goals")
    .select("id", { count: "exact", head: true })
    .gte("created_at", coverageStart)
    .neq("track_status", "awaiting_approval");

  // A read that failed is not a system that is healthy. Saying so is the whole
  // point of the page (Architecture Rule 5).
  if (eventsError || goalsError) {
    return (
      <Shell>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-400" />
            <div>
              <p className="font-semibold text-slate-200">Could not read the telemetry</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                This page has no data to show — which is not the same as the
                system being healthy. Reload to try again.
              </p>
              <p className="mt-3 font-mono text-xs text-red-400/80">
                {eventsError?.message ?? goalsError?.message}
              </p>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const rows      = (events ?? []) as OperationEventRow[];
  const truncated = rows.length >= ROW_CAP;
  const stats     = rollupOperations(rows);
  const overall   = totals(stats);

  const byId  = new Map(stats.map(s => [s.id, s]));
  const chat  = byId.get("ask.chat");
  const table = stats.filter(s => s.id !== "ask.chat");

  // Only 'ok' and 'failed' correspond to a goal that was actually inserted. A
  // refused build was turned away by the usage gate before any goal existed,
  // so counting it here would mask a real ghost with a phantom success.
  const recordedBuilds = rows.filter(
    r => r.operation === "track.build" && (r.outcome === "ok" || r.outcome === "failed"),
  ).length;

  const coverage = buildCoverage(goalsCreated ?? 0, recordedBuilds, telemetryStart !== null);
  const silent   = silentFailures(stats);
  const health   = chatHealth(chat);

  return (
    <Shell>
      {/* ── 1. Ghost failure check ────────────────────────────────────── */}
      <section
        className={`rounded-2xl border p-6 ${
          coverage.state === "gap"      ? "border-red-500/30 bg-red-500/5"
          : coverage.state === "complete" ? "border-green-500/25 bg-green-500/5"
                                          : "border-slate-800 bg-slate-900/40"
        }`}
      >
        <div className="flex items-start gap-4">
          {coverage.state === "gap" ? (
            <AlertTriangle size={22} className="mt-0.5 shrink-0 text-red-400" />
          ) : coverage.state === "complete" ? (
            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-green-400" />
          ) : (
            <Activity size={22} className="mt-0.5 shrink-0 text-slate-500" />
          )}

          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-slate-100">
              {coverage.state === "gap"      ? `${coverage.unrecorded} ghost builds`
              : coverage.state === "complete" ? "System healthy"
                                              : "Waiting for the first event"}
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
              {coverage.state === "gap"
                ? "Goals were created whose track build left no trace at all — not a success, not a failure, not even a client timeout. The background invocation was killed before it could report anything."
                : coverage.state === "complete"
                ? "Every goal created since instrumentation began has a matching track build on record. No background process has died unobserved."
                : "Nothing has been recorded yet, so there is no baseline to compare goals against. This is the absence of evidence, not evidence of health — every existing goal predates instrumentation and could never have a build on record."}
            </p>

            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <Figure label="Goals created" value={coverage.goalsCreated} />
              <Figure label="Builds recorded" value={coverage.recordedBuilds} />
              {coverage.state !== "no-telemetry" && (
                <Figure
                  label="Unaccounted for"
                  value={Math.max(0, coverage.unrecorded)}
                  tone={coverage.state === "gap" ? "text-red-400" : "text-slate-300"}
                />
              )}
            </div>

            <p className="mt-3 text-xs text-slate-600">
              {coverage.state === "no-telemetry"
                ? "Comparison begins with the first recorded event."
                : "Compared from the first recorded event onward. Goals awaiting topic approval are excluded — they have not attempted a build yet."}
            </p>
          </div>
        </div>
      </section>

      {/* ── Silent failures ───────────────────────────────────────────── */}
      {silent.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <EyeOff size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-slate-200">
                Failures nobody saw
              </p>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
                These operations fail open: the request succeeded and the learner
                noticed nothing, so no one will ever report them.{" "}
                {silent.map(s => `${s.label} failed ${s.failed}×`).join(", ")}.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── 2. Operations overview ────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="flex items-baseline justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-200">Operations</h2>
          <span className="text-xs text-slate-600 tabular-nums">
            {overall.attempts} attempts · last {WINDOW_DAYS} days
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60 text-xs uppercase tracking-wider text-slate-600">
                <th className="px-6 py-3 text-left font-medium">Operation</th>
                <th className="px-4 py-3 text-right font-medium">Volume</th>
                <th className="px-4 py-3 text-right font-medium">Success</th>
                <th className="px-4 py-3 text-right font-medium">Failure</th>
                <th className="px-4 py-3 text-right font-medium">Refused</th>
                <th className="px-4 py-3 text-right font-medium">p50 / p95</th>
                <th className="px-6 py-3 text-left font-medium">Top error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {table.map(s => (
                <OperationRow key={s.id} stats={s} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t border-slate-800/60 px-6 py-3 text-xs leading-relaxed text-slate-600">
          Success and failure are shares of decisive attempts. Refusals are
          excluded from that denominator — a usage gate or an off-domain topic is
          the system working, and counting it as a failure would make a busy week
          look like an outage. Refused is shown as a share of all attempts.
        </p>
      </section>

      {/* ── 3. Chat anomaly spotlight ─────────────────────────────────── */}
      <ChatSpotlight stats={chat} health={health} />

      {truncated && (
        <p className="text-xs text-amber-400/80">
          Showing the {ROW_CAP} most recent events only — figures above are a
          partial view of this window.
        </p>
      )}
    </Shell>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
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
          <span className="font-serif text-lg font-semibold">Observability</span>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <Activity size={12} />
          Last {WINDOW_DAYS} days
        </span>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-8 py-8">{children}</main>
    </div>
  );
}

function Figure({ label, value, tone = "text-slate-300" }: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
    </span>
  );
}

function OperationRow({ stats }: { stats: OperationStats }) {
  const decisive    = stats.ok + stats.failed;
  const successRate = decisive === 0 ? null : stats.ok / decisive;
  const refusedRate = stats.attempts === 0 ? null : stats.refused / stats.attempts;
  const hasFailures = stats.failed > 0;

  return (
    <tr className={`transition-colors hover:bg-slate-800/20 ${stats.attempts === 0 ? "opacity-45" : ""}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-200">{stats.label}</span>
          {stats.failureIsSilent && badge("silent", "bg-amber-500/15 text-amber-400")}
        </div>
        <span className="font-mono text-xs text-slate-600">{stats.id}</span>
      </td>

      <td className="px-4 py-4 text-right tabular-nums text-slate-300">{stats.attempts}</td>

      <td className="px-4 py-4 text-right tabular-nums text-slate-400">{pct(successRate)}</td>

      <td className={`px-4 py-4 text-right tabular-nums ${hasFailures ? "font-semibold text-red-400" : "text-slate-500"}`}>
        {pct(stats.failureRate)}
        {hasFailures && <span className="ml-1.5 text-xs font-normal text-slate-600">({stats.failed})</span>}
      </td>

      <td className="px-4 py-4 text-right tabular-nums text-slate-400">
        {pct(refusedRate)}
        {stats.refused > 0 && <span className="ml-1.5 text-xs text-slate-600">({stats.refused})</span>}
      </td>

      <td className="px-4 py-4 text-right tabular-nums text-slate-500">
        {dur(stats.p50DurationMs)} <span className="text-slate-700">/</span> {dur(stats.p95DurationMs)}
      </td>

      <td className="px-6 py-4">
        {stats.topErrorClasses.length === 0 ? (
          <span className="text-slate-700">—</span>
        ) : (
          <span className="font-mono text-xs text-slate-400">
            {stats.topErrorClasses[0].errorClass}
            <span className="ml-1.5 text-slate-600">×{stats.topErrorClasses[0].count}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

function ChatSpotlight({ stats, health }: {
  stats:  OperationStats | undefined;
  health: ReturnType<typeof chatHealth>;
}) {
  const anomaly  = health === "anomaly";
  const decisive = stats ? stats.ok + stats.failed : 0;

  const tone = anomaly
    ? "border-red-500/30 bg-red-500/5"
    : health === "normal"
    ? "border-slate-800 bg-slate-900/50"
    : "border-slate-800 bg-slate-900/30";

  return (
    <section className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Ask Hugh</h2>
            <span className="font-mono text-xs text-slate-600">ask.chat</span>
            {anomaly
              ? badge("anomaly", "bg-red-500/20 text-red-300")
              : health === "normal"
              ? badge("normal", "bg-green-500/15 text-green-400")
              : badge("insufficient data", "bg-slate-700/60 text-slate-400")}
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            {health === "no-data"
              ? "Nothing recorded in this window."
              : health === "too-few"
              ? `A rate needs a sample. Judging resumes at ${CHAT_MIN_SAMPLE} decisive attempts — there have been ${decisive}.`
              : anomaly
              ? `Above the ${pct(CHAT_ANOMALY_THRESHOLD)} threshold. Something is failing for learners mid-conversation.`
              : `Within the ${pct(CHAT_ANOMALY_THRESHOLD)} threshold.`}
          </p>

          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            Chat is aggregated to a single rate on purpose: it outnumbers every
            other operation by orders of magnitude, and a list of its rows would
            bury the five worth reading.
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-3xl font-bold tabular-nums ${anomaly ? "text-red-400" : "text-slate-200"}`}>
            {health === "no-data" ? "—" : pct(stats?.failureRate ?? null)}
          </p>
          <p className="mt-1 text-xs text-slate-600 tabular-nums">
            {stats?.failed ?? 0} of {decisive} decisive
          </p>
        </div>
      </div>
    </section>
  );
}
