"use client";

import dynamic from "next/dynamic";
import {
  Play,
  Loader2,
  RotateCcw,
  Terminal,
  AlertCircle,
  ChevronsRight,
} from "lucide-react";
import { useCaseNotebook } from "@/hooks/useCaseNotebook";
import { runProgress } from "@/lib/case-lab/notebook";
import type { CaseLabNotebook as Notebook } from "@/types/case-lab";

/**
 * The worked notebook, sitting under the dataset on a Case Lab case page.
 *
 * The friction this removes is the gap between reading a problem and being able
 * to touch it: no download, no upload, no environment. The case CSV is already
 * bound as `df` before the first cell runs, and the cells are the case's own
 * suggested approach turned into runnable Python with the reasoning above each
 * one. Every cell is editable — following the method is the floor, not the ceiling.
 *
 * Collapsed by default, like the teaching note, so a learner who wants to attempt
 * the case cold simply never opens it.
 *
 * NOTHING heavy is imported here. The cell list pulls in CodeMirror (~480KB), so
 * it lives behind a dynamic import and is fetched only once a learner opens the
 * notebook — otherwise all 38 Case Lab pages would pay for an editor that only
 * one of them currently shows.
 */
const NotebookCells = dynamic(() => import("./NotebookCells"), {
  ssr: false,
  loading: () => (
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
      <Loader2 size={16} className="animate-spin text-sky-400" />
      Loading the editor…
    </div>
  ),
});

export default function CaseLabNotebook({
  notebook,
  csvPath,
}: {
  notebook: Notebook;
  csvPath: string;
}) {
  const nb = useCaseNotebook(notebook, csvPath);
  const { status, bootError, summary, cells, code, busy } = nb;
  const progress = runProgress(cells);

  if (status === "closed") {
    return (
      <section className="mt-12">
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-8 text-center">
          <Terminal className="mx-auto text-sky-400" size={24} />
          <p className="mt-3 font-semibold text-slate-200">
            Work it here — no download, no setup.
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-400">{notebook.intro}</p>
          <p className="mx-auto mt-3 max-w-lg text-xs text-slate-500">
            Python runs in your browser with the dataset already loaded as{" "}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-emerald-300">df</code>.
            Nothing is sent anywhere. The first open downloads Python and pandas,
            which takes a few seconds.
          </p>
          <button
            onClick={nb.open}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-5 py-2.5 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
          >
            <Play size={16} />
            Open the notebook
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-12">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
          <Terminal size={15} />
          The notebook
        </h2>
        {status === "ready" && (
          <div className="flex items-center gap-2">
            <span className="mr-1 text-xs text-slate-500">
              {progress.done} / {progress.total} run
            </span>
            <button
              onClick={nb.runAll}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ChevronsRight size={13} />
              )}
              Run all
            </button>
            <button
              onClick={nb.reset}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 disabled:opacity-40"
            >
              <RotateCcw size={13} />
              Reset
            </button>
          </div>
        )}
      </div>

      {status === "booting" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin text-sky-400" />
          Starting Python and loading the dataset…
        </div>
      )}

      {status === "failed" && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">The notebook could not start.</p>
            <p className="mt-1 text-red-300/70">{bootError}</p>
            <p className="mt-2 text-slate-500">
              You can still download the CSV above and work the case in your own tools.
            </p>
          </div>
        </div>
      )}

      {status === "ready" && (
        <>
          {summary && (
            <p className="mt-2 text-sm text-slate-500">
              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-emerald-300">
                df
              </code>{" "}
              is loaded — {summary.rows.toLocaleString()} rows × {summary.columns.length}{" "}
              columns. Edit any cell and re-run it.
            </p>
          )}

          <NotebookCells
            cells={notebook.cells}
            states={cells}
            code={code}
            busy={busy}
            onEdit={nb.editCell}
            onRun={nb.runCell}
          />
        </>
      )}
    </section>
  );
}
