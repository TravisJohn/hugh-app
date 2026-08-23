"use client";

import { useCallback } from "react";
import { Play, Loader2, Eye } from "lucide-react";
import CmEditor from "@/components/code/CmEditor";
import type { CellState } from "@/lib/case-lab/notebook";
import type { CaseLabNotebookCell } from "@/types/case-lab";

/**
 * The cell list — split out from `CaseLabNotebook` for one reason: it imports
 * CodeMirror, which is ~480KB of the page's JavaScript.
 *
 * Kept in the same module as the collapsed card, that weight was paid by every
 * Case Lab case page, including the ones with no notebook at all. Behind a
 * dynamic import it is fetched only when a learner actually opens a notebook.
 * Anything heavy belongs on this side of that boundary; keep the parent light.
 */
export default function NotebookCells({
  cells,
  states,
  code,
  busy,
  onEdit,
  onRun,
}: {
  cells: CaseLabNotebookCell[];
  states: CellState[];
  code: string[];
  busy: boolean;
  onEdit: (index: number, next: string) => void;
  onRun: (index: number) => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      {cells.map((cell, i) => (
        <NotebookCell
          key={i}
          index={i}
          cell={cell}
          state={states[i]}
          code={code[i] ?? ""}
          busy={busy}
          onEdit={onEdit}
          onRun={onRun}
        />
      ))}
    </div>
  );
}

/** One authored step: the reasoning, the code, and whatever the code produced. */
function NotebookCell({
  index,
  cell,
  state,
  code,
  busy,
  onEdit,
  onRun,
}: {
  index: number;
  cell: CaseLabNotebookCell;
  state: CellState;
  code: string;
  busy: boolean;
  onEdit: (index: number, next: string) => void;
  onRun: (index: number) => void;
}) {
  const handleEdit = useCallback((next: string) => onEdit(index, next), [onEdit, index]);
  const handleRun = useCallback(() => onRun(index), [onRun, index]);

  // CodeMirror fills its parent, so the parent has to be sized. Grow with the
  // code (the learner may add lines) but never tall enough to dominate the page.
  const lines = Math.min(Math.max(code.split("\n").length, 3), 18);
  const editorHeight = lines * 20 + 16;

  const running = state.status === "running";
  const stale = state.status === "stale";

  // `data-status` exists so the QA driver (scripts/verify-notebooks.mjs) can read
  // a cell's real lifecycle state instead of inferring it from Tailwind opacity
  // classes — a restyle must not be able to turn the check green by accident.
  return (
    <div
      data-testid="nb-cell"
      data-cell-index={index}
      data-status={state.status}
      className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
    >
      {/* Reasoning */}
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-400">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-200">{cell.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{cell.explain}</p>
        </div>
      </div>

      {/* Code */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
        <div style={{ height: editorHeight }}>
          <CmEditor value={code} onChange={handleEdit} onSubmit={handleRun} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={handleRun}
          disabled={busy}
          data-testid="nb-run-cell"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-40"
        >
          {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          Run
        </button>
        <span className="text-[11px] text-slate-600">Shift + Enter</span>
        {stale && (
          <span className="text-[11px] text-amber-400/80">
            An earlier cell re-ran — this output may be out of date.
          </span>
        )}
      </div>

      <CellOutputView state={state} />

      {/* The "what to look for" line is withheld until the cell has actually
          produced something, so it reads as an interpretation of a result rather
          than a spoiler sitting above it. */}
      {cell.reads && (state.status === "done" || state.status === "stale") && (
        <p className="mt-3 flex gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm leading-relaxed text-emerald-200/90">
          <Eye size={15} className="mt-0.5 shrink-0 text-emerald-400" />
          {cell.reads}
        </p>
      )}
    </div>
  );
}

function CellOutputView({ state }: { state: CellState }) {
  if (state.status === "error") {
    return (
      <pre className="mt-3 overflow-x-auto rounded-xl border border-red-500/30 bg-red-500/5 p-3 font-mono text-xs text-red-300">
        {state.error}
      </pre>
    );
  }

  const output = state.output;
  if (!output) return null;
  if (!output.stdout && !output.html && !output.text) return null;

  const dim = state.status === "stale" ? "opacity-50" : "";

  return (
    <div className={`mt-3 space-y-2 ${dim}`}>
      {output.stdout && (
        <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0A0F1E] p-3 font-mono text-xs text-slate-300">
          {output.stdout.trimEnd()}
        </pre>
      )}
      {output.html && (
        // The markup comes from pandas rendering this page's own static CSV in
        // the learner's own browser — no third-party or server-supplied HTML.
        <div
          className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0A0F1E] p-3"
          dangerouslySetInnerHTML={{ __html: output.html }}
        />
      )}
      {output.text && (
        <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0A0F1E] p-3 font-mono text-xs text-emerald-300">
          {output.text}
        </pre>
      )}
    </div>
  );
}
