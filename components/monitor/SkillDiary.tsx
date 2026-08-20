"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SKILL_NOTE_MAX, type SkillSummary } from "@/lib/monitor/skills";
import EffortPicker, { EFFORT_WORDS } from "./EffortPicker";

// The diary: one line about what you actually did, and the recent lines beneath
// it. A tick with no note still counts on the heatmap — it just shades lighter.
// Forcing a sentence every day is how a tracker gets abandoned, so honesty here
// costs nothing.

interface Props {
  summary:  SkillSummary;
  busy:     boolean;
  onSave:   (note: string, effort: number) => Promise<void>;
  onRemove: (entryId: string) => Promise<void>;
  /** Re-rate an entry already on the record; null drops it to a bare tick. */
  onSetEffort: (entryId: string, effort: number | null) => Promise<void>;
}

/** The middle of the scale. Writing a note is already a deliberate act; the
 *  rating shouldn't start at an extreme and dare you to disagree with it. */
const DEFAULT_EFFORT = 3;

/** "16 Jun" — short, because the year is almost always this one. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function SkillDiary({ summary, busy, onSave, onRemove, onSetEffort }: Props) {
  const [note, setNote]     = useState("");
  const [effort, setEffort] = useState(DEFAULT_EFFORT);

  async function save() {
    const trimmed = note.trim();
    if (!trimmed || busy) return;
    setNote("");
    setEffort(DEFAULT_EFFORT);
    await onSave(trimmed, effort);
  }

  // Every entry, not only the written ones. A bare tick is still a claim about
  // a day, and one you could not see was one you could not correct — the only
  // way back from a mis-tick used to be finding it in a list that excluded it.
  const recent = summary.entries.slice(0, 12);

  return (
    <div className="shrink-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
      <h2 className="text-sm font-semibold text-slate-300">Diary entry</h2>
      <p className="mb-2 truncate text-xs text-slate-600">for &ldquo;{summary.skill.name}&rdquo;</p>

      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        maxLength={SKILL_NOTE_MAX}
        rows={4}
        placeholder="What did you actually work out today?"
        className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-600"
      />

      <div className="mt-2 flex items-center gap-2">
        <EffortPicker
          value={effort}
          busy={busy}
          size="md"
          subject={`this ${summary.skill.name} entry`}
          onPick={setEffort}
        />
        <span className="text-[11px] text-slate-500">{EFFORT_WORDS[effort]}</span>
        <span className="ml-auto text-[11px] text-slate-700">
          {note.length}/{SKILL_NOTE_MAX}
        </span>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy || note.trim().length === 0}
        className="mt-2 w-full rounded-lg bg-cyan-500/15 px-3 py-1.5 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save entry
      </button>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        A cell shades by the hardest session that day — a light day still counts,
        it just shades lighter.
      </p>

      {recent.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
            Recent
            <span className="font-normal normal-case tracking-normal text-[11px] text-slate-700">
              click a rating to change it
            </span>
          </h3>
          <div className="flex flex-col gap-2">
            {recent.map(e => (
              <div key={e.id} className="group flex gap-2 rounded-lg bg-slate-950/40 px-2.5 py-2">
                <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-slate-600">
                  {shortDate(e.entry_date)}
                </span>
                <div className="mt-0.5">
                  <EffortPicker
                    value={e.effort ?? 0}
                    busy={busy}
                    clearAt={e.effort}
                    subject={`the ${shortDate(e.entry_date)} entry`}
                    onPick={n => onSetEffort(e.id, n === e.effort ? null : n)}
                  />
                </div>
                <p className={`min-w-0 flex-1 text-xs leading-relaxed ${
                  e.note === null ? "italic text-slate-600" : "text-slate-400"
                }`}>
                  {e.note ?? `ticked — ${e.effort === null ? "no rating" : EFFORT_WORDS[e.effort]}`}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(e.id)}
                  aria-label="Remove this entry"
                  title="Remove this entry"
                  className="h-fit shrink-0 rounded p-0.5 text-slate-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 disabled:cursor-not-allowed"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
