import type { Artifact as ArtifactData } from "@/types/cases";

/**
 * Renders a case's placeholder chart/table block (real charts come later).
 * Bars are horizontal, sized relative to the max value; a highlighted bar draws
 * the eye to the signal. Purely presentational.
 */
export default function Artifact({ artifact }: { artifact?: ArtifactData }) {
  if (!artifact) return null;

  if (artifact.type === "bars") {
    const max = Math.max(...artifact.bars.map((b) => b.value)) || 1;
    return (
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">
          {artifact.title}
        </div>
        <div className="space-y-2">
          {artifact.bars.map((b, i) => {
            const pct = ((b.value / max) * 100).toFixed(1);
            return (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div
                  className={`w-24 shrink-0 truncate text-right sm:w-36 ${
                    b.highlight ? "font-medium text-slate-200" : "text-slate-500"
                  }`}
                >
                  {b.label}
                </div>
                <div className="h-5 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className={`h-5 rounded ${b.highlight ? "bg-sky-500" : "bg-slate-600"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div
                  className={`w-12 shrink-0 tabular-nums ${
                    b.highlight ? "font-semibold text-sky-300" : "text-slate-400"
                  }`}
                >
                  {b.value}
                  {artifact.unit === "%" ? "%" : ""}
                </div>
              </div>
            );
          })}
        </div>
        {artifact.caption && (
          <div className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
            {artifact.caption}
          </div>
        )}
      </div>
    );
  }

  // table
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="border-b border-slate-800 px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
        {artifact.title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {artifact.headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {artifact.rows.map((row, r) => (
              <tr key={r} className="border-t border-slate-800">
                {row.map((cell, c) => (
                  <td key={c} className="px-3 py-2 text-slate-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
