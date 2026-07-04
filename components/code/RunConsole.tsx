import type { LadderState, RunResult } from "@/types/code";

interface Props {
  state: LadderState;
  result: RunResult | null;
}

/** One-line status/output strip under the editors. */
export default function RunConsole({ state, result }: Props) {
  if (state === "CHECKING") {
    return <span className="text-sm text-slate-400">Checking…</span>;
  }
  if (state === "PASS") {
    return <span className="text-sm font-medium text-emerald-400">✓ Passed — next rung…</span>;
  }
  if (result?.error) {
    return (
      <span
        className="truncate font-mono text-xs text-red-400"
        title={result.error}
      >
        {result.error}
      </span>
    );
  }
  if (result?.stdout) {
    return (
      <span className="truncate font-mono text-xs text-slate-400" title={result.stdout}>
        {result.stdout}
      </span>
    );
  }
  return <span className="text-sm text-slate-600">Output and errors appear here.</span>;
}
