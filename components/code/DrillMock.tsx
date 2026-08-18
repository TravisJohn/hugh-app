"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Play, Check, Loader2, Volume2, VolumeX,
  Music, Music2, RotateCcw, Eye, EyeOff, Trophy, Zap, RefreshCw, Minus, Plus,
  Lightbulb, Clock, MessageCircle, Pin, Trash2,
} from "lucide-react";
import { PyodideRunner } from "@/lib/code/pyodideClient";
import { DuckDBRunner } from "@/lib/code/duckdbClient";
import {
  timerSecondsFor, resultVarOf, columnsOf,
  type DrillContent, type DrillCell, type DataRow,
} from "@/lib/code/drillContent";
import type { DrillLang, DrillRunner } from "@/types/code";
import CmEditor from "./CmEditor";
import ConfettiCanvas, { type ConfettiHandle } from "./ConfettiCanvas";
import SwarmBackdrop from "./SwarmBackdrop";
import CodeChat, { RichText, type ChatCard } from "./CodeChat";
import { useDrillAudio } from "@/hooks/useDrillAudio";

// Fire-and-forget: log one cell check for the practice-history badges/heatmap.
// Never awaited by the run flow, and a failure here (including the table not
// existing yet) is silently swallowed — this is a nice-to-have, not a
// dependency of the drill actually working.
function logAttempt(packId: string, cellId: string, passed: boolean, usedRef: boolean) {
  fetch("/api/code/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packId, cellId, passed, usedRef }),
  }).catch(() => {});
}

type Status = "idle" | "running" | "pass" | "fail";
interface CState { code: string; status: Status; attempts: number; usedRef: boolean; overTime: boolean; error: string | null; practice: boolean }
interface PinnedThought { id: string; text: string }

function comboLabel(c: number): string | null {
  if (c >= 6) return "Unstoppable!";
  if (c >= 5) return "On fire! 🔥";
  if (c >= 3) return "Great!";
  return null; // no low-tier "Nice!" — only celebrate a real streak
}

// Each round tightens the clock — gentle first pass, faster every repeat.
const LEVEL_SPEEDUP = 0.85;

// A precomputed cell answer, ready to render: a list of flat dicts becomes a
// table (it IS a dataframe), everything else stays a compact value.
type CellResult =
  | { kind: "table"; rows: DataRow[] }
  | { kind: "value"; text: string };

// Python that prints the result variable as a small JSON envelope we can render
// richly. default=str keeps it total (sets are sorted first for a stable order).
const emitResult = (varName: string) => `
import json as _json
def _emit(_v):
    try:
        import pandas as _pd
        if isinstance(_v, _pd.DataFrame):
            print(_json.dumps({"kind": "table", "rows": _v.to_dict("records")}, default=str)); return
        if isinstance(_v, _pd.Series):
            if _v.index.equals(_pd.RangeIndex(len(_v))):
                print(_json.dumps({"kind": "value", "value": _v.tolist()}, default=str)); return
            _rows = [{"index": str(_k), "value": _val} for _k, _val in _v.items()]
            print(_json.dumps({"kind": "table", "rows": _rows}, default=str)); return
    except Exception:
        pass
    if isinstance(_v, set):
        _v = sorted(_v, key=str)
    if isinstance(_v, list) and len(_v) > 0 and all(isinstance(_x, dict) for _x in _v):
        _out = {"kind": "table", "rows": _v}
    else:
        _out = {"kind": "value", "value": _v}
    print(_json.dumps(_out, default=str))
_emit(${varName})`;

function parseResult(stdout: string): CellResult | null {
  const last = stdout.trim().split("\n").pop();
  if (!last) return null;
  try {
    const o = JSON.parse(last) as { kind?: string; rows?: unknown; value?: unknown };
    if (o.kind === "table" && Array.isArray(o.rows)) return { kind: "table", rows: o.rows as DataRow[] };
    if (o.kind === "value") {
      const v = o.value;
      return { kind: "value", text: v !== null && typeof v === "object" ? JSON.stringify(v) : String(v) };
    }
  } catch {
    /* not our envelope — leave unshown */
  }
  return null;
}

/** A list-of-dicts result rendered as the little dataframe it actually is. */
function ResultTable({ rows }: { rows: DataRow[] }) {
  const cols = columnsOf(rows);
  return (
    <div className="overflow-x-auto rounded-lg border border-emerald-500/30 bg-emerald-500/5">
      <table className="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} className="whitespace-nowrap px-2 py-1 text-left font-semibold text-emerald-300/80">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-emerald-500/15">
              {cols.map(c => (
                <td key={c} className={`whitespace-nowrap px-2 py-0.5 text-emerald-200/80 ${typeof r[c] === "number" ? "text-right tabular-nums" : ""}`}>
                  {r[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The working data as a real dataframe, sticky beside the cells so it stays in
 * view no matter how far you scroll. The active cell's `focus` columns light up,
 * so you can see which part of the table each step reaches for. Always visible —
 * your input is never a spoiler, so it shows in Test mode too.
 */
function DataFrameTable({ dataset, focus, lang, tableName, isPandas }: { dataset: DataRow[]; focus: string[]; lang: DrillLang; tableName: string; isPandas: boolean }) {
  const cols = columnsOf(dataset);
  const lit = (c: string) => focus.includes(c);
  const isSql = lang === "sql";
  const label = isSql ? tableName : isPandas ? "df" : "rows";
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        <span>Your data · {label}</span>
        <span className="font-mono normal-case tracking-normal">{dataset.length}×{cols.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <thead>
            <tr>
              {cols.map(c => (
                <th
                  key={c}
                  className={`px-2.5 py-1.5 text-left font-semibold ${lit(c) ? "bg-sky-500/15 text-sky-300" : "text-slate-500"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.map((row, i) => (
              <tr key={i}>
                {cols.map(c => (
                  <td
                    key={c}
                    className={`whitespace-nowrap px-2.5 py-1 tabular-nums ${
                      lit(c) ? "bg-sky-500/10 text-sky-200" : "text-slate-400"
                    } ${typeof row[c] === "number" ? "text-right" : ""}`}
                  >
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* The access convention, always visible — so a card practised cold still
          tells you the data is already there, its name, and how to read it (never
          the answer). Python: a list of dicts (r["col"] in a loop). SQL: a table
          you query with SELECT … FROM <name>. */}
      <div className="border-t border-slate-800 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        {isSql ? (
          <>
            Already loaded as the table <code className="rounded bg-slate-800/70 px-1 text-slate-300">{tableName}</code>.
            Query it with <code className="rounded bg-slate-800/70 px-1 text-slate-300">SELECT … FROM {tableName}</code>, and
            reference a column by its name, e.g. <code className="rounded bg-slate-800/70 px-1 text-slate-300">{cols[0] ?? "col"}</code>.
          </>
        ) : isPandas ? (
          <>
            Already loaded for you as <code className="rounded bg-slate-800/70 px-1 text-slate-300">df</code> — a pandas DataFrame.
            Grab a column with <code className="rounded bg-slate-800/70 px-1 text-slate-300">df[&quot;{cols[0] ?? "col"}&quot;]</code>, and
            filter with <code className="rounded bg-slate-800/70 px-1 text-slate-300">df[df[&quot;{cols[0] ?? "col"}&quot;] == …]</code>.
          </>
        ) : (
          <>
            Already loaded for you as <code className="rounded bg-slate-800/70 px-1 text-slate-300">rows</code> — a list of dicts
            (your table). Loop it with <code className="rounded bg-slate-800/70 px-1 text-slate-300">for r in rows</code>, and read
            a field with <code className="rounded bg-slate-800/70 px-1 text-slate-300">r[&quot;{cols[0] ?? "col"}&quot;]</code>.
          </>
        )}
      </div>
      {focus.length > 0 && (
        <div className="border-t border-slate-800 px-3 py-1.5 text-[11px] text-slate-500">
          This step reaches for <span className="font-semibold text-sky-300">{focus.join(" + ")}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The "reading the code" panel — a plain-language walkthrough of how the active
 * cell's solution is built, read outside-in, with the live-computed result as a
 * small confirmation. Narrates the reference, so it's gated by the Reference
 * toggle: shows in Practice, hidden in Test.
 */
function KeyPanel({ cell, result }: { cell: DrillCell; result: CellResult | undefined }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-950/40">
      <div className="border-b border-slate-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        Reading the code
      </div>
      <div className="space-y-3.5 p-4">
        <pre className="overflow-x-auto rounded-lg border border-sky-500/20 bg-sky-950/20 p-2.5 font-mono text-[11.5px] leading-relaxed text-sky-200/80">{cell.solution}</pre>

        {cell.steps && cell.steps.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">The logic, step by step</div>
            <ol className="space-y-2">
              {cell.steps.map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="text-[13px] leading-snug text-slate-300">{s.do}</span>
                    {s.code && (
                      <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded bg-slate-800/60 px-1.5 py-0.5 font-mono text-[11px] text-sky-200/75">
                        {s.code}
                      </code>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {cell.narrative && (
          <div className="border-t border-slate-800 pt-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">In plain English</div>
            <p className="text-[13px] leading-relaxed text-slate-300">{cell.narrative}</p>
          </div>
        )}
        <div className="border-t border-slate-800 pt-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Produces</div>
          {result?.kind === "table" ? (
            <ResultTable rows={result.rows} />
          ) : (
            <code className="block overflow-x-auto whitespace-nowrap rounded bg-emerald-500/10 px-2 py-1 font-mono text-xs tabular-nums text-emerald-300">
              {result?.kind === "value" ? result.text : "…"}
            </code>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Notebook-drill loop for the "Code" pillar. The prompt + reference live OUTSIDE
 * the editor (read-only, non-copyable) so you must type from memory rather than
 * uncommenting. Shift+Enter checks a cell against hidden asserts on the result.
 * A learner-controlled Reference toggle replaces the rigid "round 2 = no
 * comments" rule; per-cell Redo + Restart let you re-practice freely. Correct
 * cells fire an escalating celebration.
 *
 * The drill content (scenario + cells) is passed in — either a generated drill
 * for the learning the user picked, or the sample fallback (see DrillLoader).
 */
export default function DrillMock({ content, packId }: { content: DrillContent; packId: string }) {
  const { scenario: SCENARIO, cells: DRILL_CELLS } = content;
  const cumulative = content.cumulative !== false; // packs (false) run each cell on fresh setup
  const dataset = SCENARIO.dataset;                // structured table → dataframe + key panels
  const lang: DrillLang = content.lang ?? "python"; // which runtime executes the cells
  const isSql = lang === "sql";
  const isPandas = lang === "python" && content.dataKind === "dataframe"; // DataFrame packs
  // Which Pyodide packages to load during boot (outside the per-run timeout) —
  // a pack can ask for more than pandas (e.g. scikit-learn for the ML packs).
  // Memoised so its identity is stable: the `?? []` fallback and the ["pandas"]
  // literal would otherwise build a fresh array on every render, and the boot
  // effect below would tear down and re-init the runtime each time.
  const bootPackages = useMemo(
    () => content.preloadPackages ?? (isPandas ? ["pandas"] : []),
    [content.preloadPackages, isPandas],
  );
  const bootLabel = isSql ? "SQL" : bootPackages.length ? `Python + ${bootPackages.join(" + ")}` : "Python";

  const emptyCells = useCallback(
    (): CState[] => DRILL_CELLS.map(() => ({ code: "", status: "idle", attempts: 0, usedRef: false, overTime: false, error: null, practice: false })),
    [DRILL_CELLS],
  );
  const timeFor = useCallback(
    (i: number, round: number): number =>
      Math.max(8, Math.round(timerSecondsFor(DRILL_CELLS[i]) * Math.pow(LEVEL_SPEEDUP, round - 1))),
    [DRILL_CELLS],
  );

  const [cells, setCells]       = useState<CState[]>(emptyCells);
  const [round, setRound]       = useState(1);
  const [active, setActive]     = useState(0);
  const [combo, setCombo]       = useState(0);
  const [started, setStarted]   = useState(false);
  const [ready, setReady]       = useState(false);
  const [initError, setInitErr] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(timeFor(0, 1));
  const [toast, setToast]       = useState<string | null>(null);
  const [showRefs, setShowRefs] = useState(true); // global "with comments" toggle
  const [fontSize, setFontSize] = useState(15);   // accessibility: editor/prompt text size
  const [glowId, setGlowId]     = useState<string | null>(null); // cell glowing right after a pass
  const [results, setResults]   = useState<Record<number, CellResult>>({}); // per-cell computed answer (key panel)
  const [chatOpen, setChatOpen]     = useState(false);
  const [chatCardId, setChatCardId] = useState<string | null>(null);        // card the chat is scoped to
  const [pins, setPins]             = useState<Record<string, PinnedThought[]>>({}); // pinned thoughts, by cell id

  const runnerRef = useRef<DrillRunner | null>(null);
  const confetti  = useRef<ConfettiHandle>(null);
  const cellsRef  = useRef(cells);
  useEffect(() => { cellsRef.current = cells; }, [cells]);
  const audio     = useDrillAudio();

  const allPassed = cells.every(c => c.status === "pass");
  const owned = allPassed && round === 2;
  // Per-card practice: redoing a card hides its help (reference line + key panel)
  // so you can try it cold, then help returns the moment you submit or peek.
  const refVisible = (i: number) => (showRefs || cells[i].usedRef) && !cells[i].practice;
  // The key panel rides the same Reference switch: shown in Practice, hidden in
  // Test so the from-memory rep stays clean. The data table stays either way.
  // Also hidden while the active card is being practised.
  const showKeyRail = started && showRefs && !!dataset && !cells[active]?.practice;

  // Chat grounding: the card its Ask icon was clicked from, else the active cell.
  const focusCell = DRILL_CELLS.find(c => c.id === chatCardId) ?? DRILL_CELLS[active];
  const focusCard: ChatCard | null = focusCell
    ? { id: focusCell.id, task: focusCell.task, solution: focusCell.solution }
    : null;
  const tableName = SCENARIO.tableName ?? "data";
  const cols = dataset ? columnsOf(dataset).join(", ") : "";
  const datasetLabel = isSql
    ? (dataset ? `a SQL table named \`${tableName}\` (columns: ${cols})` : `a SQL table named \`${tableName}\``)
    : isPandas
      ? (dataset ? `a pandas DataFrame named \`df\` (columns: ${cols})` : "a pandas DataFrame named `df`")
      : dataset
        ? `a list of dicts named \`rows\` (columns: ${cols})`
        : SCENARIO.setupCode.trim()
          ? "a Python list of dicts named `rows`"
          : "no shared data — each rep is a self-contained snippet";

  const openChatForCard = useCallback((id: string) => { setChatCardId(id); setChatOpen(true); }, []);
  const handleChatOpen = useCallback((v: boolean) => { setChatOpen(v); if (!v) setChatCardId(null); }, []);

  // Pinned thoughts live in Supabase (per user, per pack) so they follow the
  // learner across devices. Load once; mutate optimistically and reconcile ids.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/code/pins?pack=${encodeURIComponent(packId)}`);
        if (!res.ok) return; // not signed in / offline — start empty
        const data = (await res.json()) as { pins?: { id: string; card_id: string; text: string }[] };
        if (cancelled || !data.pins) return;
        const grouped: Record<string, PinnedThought[]> = {};
        for (const p of data.pins) (grouped[p.card_id] ??= []).push({ id: p.id, text: p.text });
        setPins(grouped);
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
  }, [packId]);

  const addPin = useCallback(async (cardId: string, text: string) => {
    const tempId = `tmp-${Date.now()}`;
    setPins(prev => ({ ...prev, [cardId]: [...(prev[cardId] ?? []), { id: tempId, text }] }));
    try {
      const res = await fetch("/api/code/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: packId, card_id: cardId, text }),
      });
      const data = (await res.json()) as { pin?: { id: string } };
      setPins(prev => ({
        ...prev,
        [cardId]: (prev[cardId] ?? []).flatMap(p =>
          p.id !== tempId ? [p] : data.pin ? [{ id: data.pin.id, text }] : [], // drop the optimistic pin if the save failed
        ),
      }));
    } catch {
      setPins(prev => ({ ...prev, [cardId]: (prev[cardId] ?? []).filter(p => p.id !== tempId) }));
    }
  }, [packId]);

  const removePin = useCallback(async (cardId: string, pinId: string) => {
    setPins(prev => ({ ...prev, [cardId]: (prev[cardId] ?? []).filter(p => p.id !== pinId) }));
    if (pinId.startsWith("tmp-")) return; // never persisted; nothing to delete server-side
    try { await fetch(`/api/code/pins?id=${encodeURIComponent(pinId)}`, { method: "DELETE" }); }
    catch { /* best-effort — it's already gone from the UI */ }
  }, []);

  useEffect(() => {
    const r: DrillRunner = isSql ? new DuckDBRunner() : new PyodideRunner();
    runnerRef.current = r;
    // Load heavy packages during boot (outside the run timeout) so the "ready"
    // gate covers the first multi-second download and cell runs stay fast.
    // Packs that need nothing extra (bootPackages empty) skip this entirely.
    r.init()
      .then(() => (bootPackages.length && r instanceof PyodideRunner ? r.preload(bootPackages) : undefined))
      .then(() => setReady(true))
      .catch(e => setInitErr(String(e?.message ?? e)));
    return () => r.destroy();
  }, [isSql, isPandas, bootPackages]);

  // Precompute each cell's answer once Python is up, by running the reference
  // solution and printing its result variable. Deterministic, off the critical
  // path, and only ever shown in the (gated) key panel — never authored by hand.
  useEffect(() => {
    if (!ready || !dataset) return;
    const runner = runnerRef.current;
    if (!runner) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < DRILL_CELLS.length; i++) {
        let res;
        if (isSql) {
          // SQL: run setup + the reference query; the runner returns the result
          // table itself (no "check"), which IS the "Produces" preview.
          res = await runner.run(SCENARIO.setupCode + "\n" + DRILL_CELLS[i].solution, "");
        } else {
          const varName = resultVarOf(DRILL_CELLS[i]);
          if (!varName) continue;
          const priors = cumulative ? DRILL_CELLS.slice(0, i).map(c => c.solution).join("\n") : "";
          res = await runner.run(SCENARIO.setupCode + "\n" + priors + "\n" + DRILL_CELLS[i].solution, emitResult(varName));
        }
        if (cancelled) return;
        if (res.passed && res.stdout) {
          const parsed = parseResult(res.stdout);
          if (parsed) setResults(prev => ({ ...prev, [i]: parsed }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ready, dataset, DRILL_CELLS, cumulative, SCENARIO.setupCode, isSql]);

  // Resets the countdown whenever the active cell or round changes. `timeLeft`
  // can't be computed as derived state — the ticking effect below independently
  // decrements it every second — so this deliberately re-syncs it on the two
  // events that should restart the clock.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTimeLeft(timeFor(active, round)); }, [active, round, timeFor]);

  // Ran out of time on the active cell → flag it (red) so it's clear which cells
  // weren't done in time. Never blocks; passing it still turns it green.
  // Practice is untimed, so overtime can only apply in Test mode. Reacting to
  // the ticking `timeLeft` reaching zero has to live in an effect — there's no
  // event to hang this off of.
  useEffect(() => {
    if (!started || showRefs || timeLeft !== 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCells(prev => prev.map((c, idx) =>
      idx === active && c.status !== "pass" && !c.overTime ? { ...c, overTime: true } : c));
  }, [timeLeft, started, active, showRefs]);

  // The speed clock only runs in Test mode (Reference off) — Practice is a
  // pressure-free read-through, so no countdown there.
  useEffect(() => {
    if (!started || allPassed || showRefs) return;
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [started, active, allPassed, showRefs]);

  // Speed meter low → reveal this cell's reference (never punishes).
  const revealRef = useCallback((i: number) => {
    // Peeking reveals help and ends practice mode for that card.
    setCells(prev => prev.map((c, idx) => (idx === i ? { ...c, usedRef: true, practice: false } : c)));
  }, []);

  useEffect(() => {
    if (!started) return;
    const cell = DRILL_CELLS[active];
    const st = cellsRef.current[active];
    if (!cell || !st || st.status === "pass" || showRefs) return;
    if (timeLeft > 0 && timeLeft <= Math.ceil(timeFor(active, round) * 0.3) && !st.usedRef) {
      revealRef(active);
    }
  }, [timeLeft, started, active, round, showRefs, revealRef, DRILL_CELLS, timeFor]);

  const setCode = useCallback((i: number, code: string) => {
    setCells(prev => prev.map((c, idx) => (idx === i ? { ...c, code } : c)));
  }, []);

  const runCell = useCallback(async (i: number) => {
    const runner = runnerRef.current;
    if (!runner || !ready) return;
    const snap = cellsRef.current;
    if (snap[i].status === "running" || snap[i].status === "pass") return;
    // Submitting ends practice mode, so help returns alongside the result.
    setCells(prev => prev.map((c, idx) => (idx === i ? { ...c, status: "running", error: null, practice: false } : c)));

    const priors = cumulative ? snap.slice(0, i).map(c => c.code).join("\n") : "";
    const preamble = SCENARIO.setupCode + "\n" + priors + "\n";
    const res = await runner.run(preamble + snap[i].code, DRILL_CELLS[i].assertions);

    // The reference being visible for this cell counts as "helped" — combo only
    // builds when you produce it from memory.
    const helped = showRefs || snap[i].usedRef;
    setCells(prev => prev.map((c, idx) =>
      idx === i
        ? { ...c, status: res.passed ? "pass" : "fail", attempts: c.attempts + 1, error: res.passed ? null : (res.error ?? "Not quite yet.") }
        : c,
    ));
    logAttempt(packId, DRILL_CELLS[i].id, res.passed, helped);

    if (res.passed) {
      const nextCombo = helped ? 0 : combo + 1;
      setCombo(nextCombo);
      confetti.current?.fire(nextCombo);
      audio.celebrate(nextCombo);
      const label = comboLabel(nextCombo);
      if (label) {
        setToast(label);
        window.setTimeout(() => setToast(null), 1300);
      }
      const passedId = DRILL_CELLS[i].id;
      setGlowId(passedId);
      window.setTimeout(() => setGlowId(g => (g === passedId ? null : g)), 1200);
      if (i + 1 < DRILL_CELLS.length) {
        setActive(i + 1);
        setTimeLeft(timeFor(i + 1, round)); // reset in the same batch — no stale-0 window
      }
    } else if (snap[i].attempts + 1 >= 2 && !showRefs) {
      revealRef(i);
    }
  }, [ready, combo, showRefs, audio, revealRef, packId, cumulative, SCENARIO.setupCode, DRILL_CELLS, timeFor, round]);

  // Stable per-cell handlers so the memoized CmEditors don't re-render en masse.
  // runCell's identity changes with combo/showRefs, so call it through a ref to
  // keep each cell's onSubmit referentially stable across renders.
  const runCellRef = useRef(runCell);
  useEffect(() => { runCellRef.current = runCell; }, [runCell]);
  const codeHandlers = useMemo(
    () => DRILL_CELLS.map((_, i) => (v: string) => setCode(i, v)),
    [DRILL_CELLS, setCode],
  );
  const runHandlers = useMemo(
    () => DRILL_CELLS.map((_, i) => () => { void runCellRef.current(i); }),
    [DRILL_CELLS],
  );

  function onType(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k.length === 1 || k === "Backspace" || k === "Enter" || k === "Tab" || k === " ") audio.click();
  }

  function start() { audio.unlock(); setStarted(true); setActive(0); setTimeLeft(timeFor(0, round)); }
  function nextRound() { const r = round + 1; setRound(r); setShowRefs(false); setCells(emptyCells()); setActive(0); setCombo(0); setTimeLeft(timeFor(0, r)); }
  function restart() { setRound(1); setShowRefs(true); setCells(emptyCells()); setActive(0); setCombo(0); setTimeLeft(timeFor(0, 1)); }
  function redoCell(i: number) {
    // Redo = practise this card cold: clear it and hide its help until submit/peek.
    setCells(prev => prev.map((c, idx) => (idx === i ? { code: "", status: "idle", attempts: 0, usedRef: false, overTime: false, error: null, practice: true } : c)));
    setActive(i);
    setTimeLeft(timeFor(i, round));
  }

  // No overflow-hidden on the root: it clips nothing (the backdrop is fixed) but
  // it WOULD break the sticky data/key rails. overflow-x-clip keeps sideways
  // bleed in check without creating a scroll container that kills sticky.
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#0A0F1E] text-slate-200">
      <SwarmBackdrop />
      <ConfettiCanvas ref={confetti} />

      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-[#0A0F1E]/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/code/start" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
            <ArrowLeft size={14} /> Back
          </Link>
          <span className="font-semibold text-slate-100">Hugh Code</span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
            Drill · spike
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Round {round}</span>
        </div>
        <div className="flex items-center gap-3">
          {combo >= 2 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-300">
              <Zap size={13} /> ×{combo}
            </span>
          )}
          {/* Text size (accessibility) */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 px-1 py-0.5">
            <button
              onClick={() => setFontSize(s => Math.max(13, s - 2))}
              disabled={fontSize <= 13}
              title="Smaller text"
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
            >
              <Minus size={12} />
            </button>
            <span className="w-8 select-none text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">Aa</span>
            <button
              onClick={() => setFontSize(s => Math.min(24, s + 2))}
              disabled={fontSize >= 24}
              title="Larger text"
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
            >
              <Plus size={12} />
            </button>
          </div>
          {started && (
            <>
              <button
                onClick={() => setShowRefs(v => !v)}
                title="Show / hide the reference answers"
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${showRefs ? "bg-sky-500/15 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}
              >
                {showRefs ? <Eye size={13} /> : <EyeOff size={13} />} Reference
              </button>
              <button onClick={restart} title="Restart the drill" className="text-slate-400 hover:text-slate-200">
                <RotateCcw size={16} />
              </button>
            </>
          )}
          <button onClick={audio.toggleSound} title="Sound" className="text-slate-400 hover:text-slate-200">
            {audio.soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button onClick={audio.toggleMusic} title="Music" className="text-slate-400 hover:text-slate-200">
            {audio.musicOn ? <Music size={16} /> : <Music2 size={16} className="opacity-40" />}
          </button>
        </div>
      </header>

      <main className={`relative z-10 mx-auto px-6 py-8 ${dataset ? "max-w-7xl" : "max-w-3xl"}`}>
        {/* Scenario — the strategic frame */}
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-sky-400">The goal</div>
          <h1 className="font-serif text-xl font-bold text-white">{SCENARIO.title}</h1>
          <p className="mt-1 text-sm italic text-slate-400">{SCENARIO.role}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{SCENARIO.goal}</p>

          {/* "You're given" — state the provided variable, its type, and how to
              read it, so learners don't guess or assume. Derived from the dataset,
              so any pure-Python pack gets it for free. */}
          {dataset && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3.5 text-xs leading-relaxed text-slate-400">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">You&apos;re given</div>
              {isSql ? (
                <>
                  <p>
                    The table <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">{tableName}</code> is already loaded — {dataset.length}{" "}
                    rows (columns: <span className="text-slate-300">{columnsOf(dataset).join(", ")}</span>). Query it with{" "}
                    <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">SELECT … FROM {tableName}</code>. Each cell is one{" "}
                    <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">SELECT</code> that must return the asked-for result.
                  </p>
                  <p className="mt-1.5 text-slate-500">
                    It runs on DuckDB (in your browser). In real work you&apos;d create and load the table yourself; here it&apos;s
                    set up so you can focus on the query.
                  </p>
                </>
              ) : isPandas ? (
                <>
                  <p>
                    <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">df</code> is already loaded for you — a pandas{" "}
                    DataFrame of {dataset.length} rows (columns:{" "}
                    <span className="text-slate-300">{columnsOf(dataset).join(", ")}</span>). Grab a column with{" "}
                    <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">df[&quot;{columnsOf(dataset)[0]}&quot;]</code> and
                    filter with a boolean mask like{" "}
                    <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">df[df[&quot;{columnsOf(dataset)[0]}&quot;] == …]</code>.
                  </p>
                  <p className="mt-1.5 text-slate-500">
                    It&apos;s a real pandas DataFrame (runs on pandas in your browser) — the tool you&apos;d actually reach for.
                    In real work you&apos;d load it yourself; here it&apos;s set up so you can focus on the moves.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">rows</code> is already loaded for you — a list of{" "}
                    {dataset.length} dicts, one per record (columns:{" "}
                    <span className="text-slate-300">{columnsOf(dataset).join(", ")}</span>). Read a field with{" "}
                    <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">r[&quot;{columnsOf(dataset)[0]}&quot;]</code> inside a{" "}
                    <code className="rounded bg-slate-800/70 px-1 text-sky-200/90">for r in rows</code> loop.
                  </p>
                  <p className="mt-1.5 text-slate-500">
                    It&apos;s a plain Python list of dicts — not a pandas DataFrame. In real work you&apos;d load the data yourself;
                    here it&apos;s set up so you can focus on the moves.
                  </p>
                </>
              )}
            </div>
          )}
          {/* Raw setup only when there's no structured table to show it better,
              and only when there IS setup code — pure-syntax packs with no
              shared state (each cell self-contained) have nothing to show here. */}
          {!dataset && SCENARIO.setupCode.trim() && (
            <>
              <div className="mt-3 text-xs text-slate-500">Setup:</div>
              <pre className="mt-1.5 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
{SCENARIO.setupCode}
              </pre>
            </>
          )}
        </div>

        {initError && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-300">
            Couldn&apos;t start {isSql ? "SQL" : "Python"}: {initError}
          </div>
        )}

        {/* No items-start: columns must stretch to full row height, otherwise the
            short side columns give their sticky children no room to travel. */}
        <div
          className={`grid gap-5 ${
            dataset
              ? showKeyRail
                ? "lg:grid-cols-[220px_minmax(0,1fr)_380px]"
                : "lg:grid-cols-[220px_minmax(0,1fr)]"
              : ""
          }`}
        >
          {/* LEFT · the dataframe, always in view (sticky), column-highlighted */}
          {dataset && (
            <aside className="hidden lg:block">
              <div className="sticky top-[76px]">
                <DataFrameTable dataset={dataset} focus={DRILL_CELLS[active]?.focus ?? []} lang={lang} tableName={tableName} isPandas={isPandas} />
              </div>
            </aside>
          )}

          {/* CENTER · start button, then the cells */}
          <div className="min-w-0">
        {!started ? (
          <button
            onClick={start}
            disabled={!ready}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 font-medium text-white transition-colors hover:bg-sky-400 disabled:opacity-50"
          >
            {ready ? <><Play size={16} /> Start drill</> : <><Loader2 size={16} className="animate-spin" /> Booting {bootLabel}…</>}
          </button>
        ) : (
          <div className="space-y-4">
            {DRILL_CELLS.map((cell, i) => {
              const st = cells[i];
              const isActive = i === active && !allPassed;
              const pct = Math.round((timeLeft / timeFor(i, round)) * 100);
              const showRef = refVisible(i) && st.status !== "pass";
              const passed = st.status === "pass";
              const glowing = glowId === cell.id;
              const overtime = st.overTime && !passed;
              return (
                <div
                  key={cell.id}
                  className={`rounded-xl border transition-all duration-700 ${
                    passed ? "border-emerald-500/50 bg-emerald-950/10"
                    : overtime ? "border-red-500/50 bg-red-950/10"
                    : isActive ? "border-sky-500/50 bg-slate-900/60"
                    : "border-slate-800 bg-slate-900/30"
                  } ${
                    glowing ? "shadow-[0_0_46px_-2px_rgba(16,185,129,0.6)]"
                    : passed ? "shadow-[0_0_22px_-8px_rgba(16,185,129,0.35)]"
                    : overtime ? "shadow-[0_0_22px_-8px_rgba(239,68,68,0.4)]"
                    : ""
                  }`}
                >
                  <div className="flex items-center justify-between px-4 py-2 text-xs">
                    <span className="font-mono text-slate-500">In [{i + 1}]</span>
                    {passed ? (
                      <span className="flex items-center gap-1 font-semibold text-emerald-400">
                        <Check size={13} /> passed{showRefs || st.usedRef ? " · with reference" : " · from memory"}
                      </span>
                    ) : overtime ? (
                      <span className="flex items-center gap-1 font-semibold text-red-400">
                        <Clock size={12} /> over time
                      </span>
                    ) : isActive && !showRefs ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-28 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full transition-all duration-1000 ease-linear ${pct <= 30 ? "bg-amber-400" : "bg-sky-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-slate-500">speed</span>
                      </div>
                    ) : isActive ? (
                      <span className="text-[11px] text-slate-600">practice · untimed</span>
                    ) : null}
                  </div>

                  {/* Prompt — the step + why it matters, outside the editor */}
                  <div className="px-4 pb-2">
                    <p className="font-medium text-slate-200" style={{ fontSize: fontSize + 1 }}>{cell.task}</p>
                    <p className="mt-1 flex gap-1.5 text-slate-500" style={{ fontSize: Math.max(11, fontSize - 3) }}>
                      <Lightbulb size={13} className="mt-0.5 shrink-0 text-amber-400/70" />
                      <span>{cell.why}</span>
                    </p>
                  </div>

                  {/* Reference to replicate — read-only, non-copyable */}
                  {showRef && (
                    <pre
                      onCopy={e => e.preventDefault()}
                      style={{ fontSize: fontSize - 1 }}
                      className="mx-4 mb-2 select-none overflow-x-auto rounded-lg border border-sky-500/20 bg-sky-950/20 p-2.5 leading-relaxed text-sky-200/80"
                      title="Type this yourself — copy is disabled on purpose."
                    >{cell.solution}</pre>
                  )}

                  <div
                    className="border-y border-slate-800/60"
                    style={{ height: Math.round(fontSize * 7 + 46) }}
                    onKeyDown={onType}
                  >
                    <CmEditor
                      value={st.code}
                      onChange={codeHandlers[i]}
                      onSubmit={runHandlers[i]}
                      readOnly={st.status === "pass"}
                      fontSize={fontSize}
                      lang={lang}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0 flex-1 truncate text-xs">
                      {st.status === "fail" && <span className="text-amber-400">✗ {st.error}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openChatForCard(cell.id)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-300"
                        title="Ask Hugh about this step"
                      >
                        <MessageCircle size={12} /> Ask
                      </button>
                      {(st.status === "pass" || st.attempts > 0) && (
                        <button onClick={() => redoCell(i)} title="Practise this card again with the help hidden" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
                          <RefreshCw size={12} /> Redo
                        </button>
                      )}
                      {st.status !== "pass" && !refVisible(i) && (
                        <button onClick={() => revealRef(i)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-300">
                          <Eye size={12} /> Reveal
                        </button>
                      )}
                      <button
                        onClick={() => runCell(i)}
                        disabled={st.status === "pass" || st.status === "running"}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-40"
                      >
                        {st.status === "running" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Run &amp; check
                        <kbd className="rounded bg-emerald-600/60 px-1 text-[9px]">⇧↵</kbd>
                      </button>
                    </div>
                  </div>

                  {/* Pinned thoughts — notes the learner pinned from the chat */}
                  {(pins[cell.id]?.length ?? 0) > 0 && (
                    <div className="space-y-1.5 border-t border-slate-800/60 px-4 py-2.5">
                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        <Pin size={10} /> Pinned thoughts
                      </div>
                      {pins[cell.id].map(p => (
                        <div key={p.id} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-1.5">
                          <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-slate-300">
                            <RichText text={p.text} />
                          </div>
                          <button
                            onClick={() => removePin(cell.id, p.id)}
                            className="mt-0.5 shrink-0 text-slate-600 hover:text-red-400"
                            title="Remove this pinned thought"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {allPassed && (
              <>
              {/* Review — the shape of what you just wrote, in logical chunks */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-sky-400">Review · the building blocks</div>
                <p className="mb-3 text-xs text-slate-500">The full solution you built, step by step.</p>
                <div className="space-y-3">
                  {DRILL_CELLS.map((cell) => (
                    <div key={cell.id}>
                      <p className="mb-1 text-slate-400" style={{ fontSize: Math.max(11, fontSize - 3) }}>{cell.task}</p>
                      <pre
                        className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 leading-relaxed text-slate-300"
                        style={{ fontSize: fontSize - 1 }}
                      >{cell.solution}</pre>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/15 p-5 text-center">
                <p className="mx-auto mb-4 max-w-md rounded-lg border border-sky-500/20 bg-sky-950/20 px-4 py-2.5 text-sm text-sky-200/90">
                  🎯 {SCENARIO.outcome}
                </p>
                {owned ? (
                  <>
                    <Trophy className="mx-auto text-amber-300" size={26} />
                    <p className="mt-2 font-semibold text-white">Owned it 🏆</p>
                    <p className="mt-1 text-sm text-slate-400">You did it from memory. That&apos;s the rep that sticks.</p>
                    <button onClick={restart} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
                      <RotateCcw size={14} /> Start over
                    </button>
                  </>
                ) : (
                  <>
                    <Check className="mx-auto text-emerald-400" size={26} />
                    <p className="mt-2 font-semibold text-white">Round 1 done.</p>
                    <p className="mt-1 text-sm text-slate-400">Round 2 hides the reference — do it from memory. (You can flip it back on anytime.)</p>
                    <button onClick={nextRound} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400">
                      <Play size={14} /> Round 2 — from memory
                    </button>
                  </>
                )}
              </div>
              </>
            )}
          </div>
        )}
          </div>{/* /center */}

          {/* RIGHT · the key panel — data → operation → result, Practice only */}
          {showKeyRail && dataset && DRILL_CELLS[active] && (
            <aside className="hidden lg:block">
              <div className="sticky top-[76px]">
                <KeyPanel cell={DRILL_CELLS[active]} result={results[active]} />
              </div>
            </aside>
          )}
        </div>{/* /grid */}
      </main>

      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-fadeIn">
          <span className="rounded-full bg-amber-500/20 px-5 py-2 text-lg font-bold text-amber-200 shadow-lg backdrop-blur">
            {toast}
          </span>
        </div>
      )}

      <CodeChat
        open={chatOpen}
        onOpenChange={handleChatOpen}
        focusCard={focusCard}
        datasetLabel={datasetLabel}
        onPin={addPin}
      />
    </div>
  );
}
