"use client";

import { useState } from "react";
import { Plus, Loader2, ArchiveRestore, ChevronRight } from "lucide-react";
import type { MonitorSkillsState } from "@/hooks/useMonitor";
import type { MonitorSkill } from "@/types/monitor";
import { MONITOR_WINDOW_DAYS } from "@/lib/monitor/skills";
import { EFFORT_SWATCHES } from "@/components/ui/CalendarHeatmap";
import { EFFORT_WORDS } from "./EffortPicker";
import SkillRow from "./SkillRow";
import SkillTickList from "./SkillTickList";
import SkillDiary from "./SkillDiary";

// Skills: you encode what you want to learn, tick the days you touched it, and
// write one diary line about it. The heatmap is the whole payoff — half a year
// of showing up, or not, at a glance.
//
// Two panes, each scrolling internally. The page does not scroll.

export default function SkillsView({ state }: { state: MonitorSkillsState }) {
  const { summaries, archived, selected, loading } = state;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-600">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 p-4">

      {/* ── Left: the skills and their heatmaps ─────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-[1.62] flex-col rounded-2xl border border-slate-800 bg-slate-900/30">
        <header className="flex shrink-0 items-baseline gap-2 border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-300">Skills you are tracking</h2>
          <span className="text-xs text-slate-600">
            {summaries.length === 0
              ? "nothing yet"
              : `${summaries.length} · ${MONITOR_WINDOW_DAYS} days shown`}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {summaries.length === 0
            ? <EmptySkills />
            : summaries.map(s => (
                <SkillRow
                  key={s.skill.id}
                  summary={s}
                  selected={selected?.skill.id === s.skill.id}
                  onSelect={() => state.select(s.skill.id)}
                  onArchive={() => state.archive(s.skill.id)}
                  busy={state.busy}
                />
              ))}

          {archived.length > 0 && (
            <ArchivedDrawer
              skills={archived}
              busy={state.busy}
              onRestore={state.restore}
            />
          )}
        </div>

        {summaries.length > 0 && <HeatLegend />}
      </section>

      {/* ── Right: today's ticks and the diary ──────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <AddSkill onAdd={state.addSkill} busy={state.busy} />
        {summaries.length > 0 && (
          <>
            <SkillTickList
              summaries={summaries}
              selectedId={selected?.skill.id ?? null}
              onSelect={state.select}
              onTick={(id, effort) => state.logEntry(id, "", effort)}
              busy={state.busy}
            />
            {selected && (
              <SkillDiary
                summary={selected}
                onSave={(note, effort) => state.logEntry(selected.skill.id, note, effort)}
                onRemove={entryId => state.removeEntry(selected.skill.id, entryId)}
                busy={state.busy}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Archived skills, reachable again.
 *
 * Archiving is a soft delete, so the archive has to be somewhere you can look —
 * otherwise putting a skill down loses it unless you remember the exact name,
 * and the "soft" in soft delete stops being true. Collapsed by default: this is
 * a way back, not part of the daily view.
 */
function ArchivedDrawer({ skills, busy, onRestore }: {
  skills: MonitorSkill[];
  busy: boolean;
  onRestore: (skillId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-slate-800/70 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-xs text-slate-600 transition-colors hover:text-slate-400"
      >
        <ChevronRight size={13} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        Archived ({skills.length})
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-1">
          {skills.map(s => (
            <div
              key={s.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/40"
            >
              <span className="truncate text-sm text-slate-500">{s.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRestore(s.id)}
                title="Put this skill back — its entries are still there"
                aria-label={`Restore ${s.name}`}
                className="ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-600 transition-colors hover:bg-slate-800 hover:text-cyan-400 disabled:cursor-not-allowed"
              >
                <ArchiveRestore size={12} /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The first thing a new learner sees here. It has to say what to do, not apologise. */
function EmptySkills() {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-slate-400">No skills yet.</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-600">
        Name something you want to get better at. Each day you touch it, tick it —
        the calendar fills in behind you.
      </p>
    </div>
  );
}

function AddSkill({ onAdd, busy }: { onAdd: (name: string) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    // Cleared straight away, not after the round-trip: the field is the only
    // thing the learner is looking at, and a name that lingers reads as a
    // failed submit. A real failure surfaces in the shell's error banner.
    setName("");
    await onAdd(trimmed);
  }

  return (
    <form onSubmit={submit} className="shrink-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
      <label htmlFor="new-skill" className="mb-2 block text-sm font-semibold text-slate-300">
        Add a skill
      </label>
      <div className="flex gap-2">
        <input
          id="new-skill"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Window functions (SQL)"
          maxLength={120}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-600"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={15} /> Add
        </button>
      </div>
    </form>
  );
}

/** The ramp, spelled out. Without it the shading is a guess. */
function HeatLegend() {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-slate-800 px-4 py-2 text-[11px] text-slate-600">
      <span>Nothing</span>
      {EFFORT_SWATCHES.map((c, i) => (
        <span
          key={c}
          title={i === 0 ? "Nothing logged" : `${i} — ${EFFORT_WORDS[i]}`}
          className={`h-[10px] w-[10px] rounded-[2px] ${c}`}
        />
      ))}
      <span>Intensive</span>
    </div>
  );
}
