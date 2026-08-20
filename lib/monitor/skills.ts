// ── Monitor Skills — pure derivation and input rules ────────────────────────
// The API route reads rows and the view renders them; everything in between
// lives here, so the fiddly parts (what counts as a duplicate skill name, what
// an empty window renders as, which note is "the latest") are unit-testable on
// plain objects.
//
// Pure: no React, no Supabase, no clock of its own — callers inject `now`.

import { bucketByPeak, activeDayCount, EFFORT_MAX, type HeatmapDay } from "@/lib/calendar";
import type { MonitorSkill, MonitorSkillEntry } from "@/types/monitor";

/**
 * How far back a skill's heatmap reaches — 182 days, half a year, as drawn in
 * the approved prototype. Deliberately wider than /code/start's 112: a skill
 * row is a full pane wide, and the whole payoff of this view is seeing six
 * months of showing up (or not) at once. A full year needs 8px cells or
 * horizontal scroll inside the row, and is a one-constant change if wanted.
 */
export const MONITOR_WINDOW_DAYS = 182;

/** Skill names are one line in a list, not a paragraph. */
export const SKILL_NAME_MAX = 120;

/** A diary line is a line. Longer thinking belongs in Ask Hugh, not here. */
export const SKILL_NOTE_MAX = 500;

/**
 * What an entry with no recorded effort is worth when shading.
 *
 * 1, the lightest step — the same weight as the least the learner could have
 * claimed. A bare tick says "I touched this" and nothing more, so reading it as
 * anything higher would invent effort nobody entered. This under-states old
 * ticks on purpose: a record may be incomplete, but it must never overstate.
 */
export const EFFORT_WHEN_UNRECORDED = 1;

export interface SkillSummary {
  skill: MonitorSkill;
  /** This skill's entries, newest first — the diary list under the composer. */
  entries: MonitorSkillEntry[];
  /** The full window, zero-filled — the heatmap's input. */
  days: HeatmapDay[];
  /** Entries inside the window. */
  windowEntries: number;
  /** Days inside the window with at least one entry. */
  activeDays: number;
  /** Most recent entry overall, window or not — the "last touched" line. */
  latest: MonitorSkillEntry | null;
}

/**
 * Trim and cap a skill name, returning null for anything that isn't a name.
 * Returning null rather than throwing lets the route answer 400 and the form
 * stay quiet about whitespace — typing spaces should simply not create a skill.
 */
export function normaliseSkillName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ").slice(0, SKILL_NAME_MAX);
  return name.length > 0 ? name : null;
}

/**
 * A note is optional — ticking a day with nothing to say is a legitimate entry,
 * and forcing a sentence would make the honest record harder to keep than the
 * dishonest one. Empty and whitespace-only both become null, so the UI has one
 * emptiness to check rather than three.
 */
export function normaliseSkillNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.trim().slice(0, SKILL_NOTE_MAX);
  return note.length > 0 ? note : null;
}

/**
 * Coerce an effort rating to 1-5, or null if it isn't one.
 *
 * Null and an out-of-range number are treated the same — not recorded — rather
 * than clamped. Clamping a 9 to 5 would silently promote a typo into the
 * strongest claim the scale can make.
 */
export function normaliseEffort(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  return raw >= 1 && raw <= EFFORT_MAX ? raw : null;
}

/** Today as YYYY-MM-DD in UTC — the default `entry_date` for a tick. */
export function todayISO(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/**
 * Accept a date only if it is a real calendar day and not in the future.
 * Backdating is allowed — remembering on Wednesday that you studied on Monday
 * is the normal case for a hand-kept record — but a future tick would put a
 * shaded cell beyond the end of the grid, where it can never be seen.
 */
export function isValidEntryDate(raw: unknown, now: Date = new Date()): raw is string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip guards against overflow dates like 2026-02-31, which Date
  // silently rolls forward into March rather than rejecting.
  if (parsed.toISOString().slice(0, 10) !== raw) return false;
  return raw <= todayISO(now);
}

/**
 * Two skills differing only in case or spacing are the same skill. Compared on
 * a folded key so "Window Functions" doesn't quietly become a second row
 * beside "window functions", each with half the history.
 */
export function skillKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function findDuplicateSkill(skills: readonly MonitorSkill[], name: string): MonitorSkill | null {
  const key = skillKey(name);
  return skills.find(s => skillKey(s.name) === key) ?? null;
}

/**
 * Join skills to their entries and derive everything the list needs in one
 * pass. Archived skills are dropped here rather than in the query, so the same
 * payload can later feed an "archived" drawer without a second fetch.
 *
 * Ordering is oldest-first, matching the order skills were added: the list is a
 * record of what you set out to learn, so it shouldn't reshuffle itself
 * whenever you tick something.
 */
export function summariseSkills(
  skills: readonly MonitorSkill[],
  entries: readonly MonitorSkillEntry[],
  now: Date = new Date(),
): SkillSummary[] {
  const bySkill = new Map<string, MonitorSkillEntry[]>();
  for (const e of entries) {
    const list = bySkill.get(e.skill_id);
    if (list) list.push(e);
    else bySkill.set(e.skill_id, [e]);
  }

  return skills
    .filter(s => s.archived_at === null)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(skill => {
      const mine = bySkill.get(skill.id) ?? [];

      // A cell shows the HARDEST session that day, not how many there were —
      // the grid answers "how hard did I go". An unrated entry counts as 1.
      const days = bucketByPeak(
        mine.map(e => ({ date: e.entry_date, value: e.effort ?? EFFORT_WHEN_UNRECORDED })),
        MONITOR_WINDOW_DAYS,
        now,
      );

      // Newest first, by the day it happened and then by when it was written —
      // two entries backdated to the same day keep their writing order. Sorted
      // here rather than trusted from the query, so a locally-added entry lands
      // in the right place without a refetch.
      const sorted = mine.slice().sort((a, b) =>
        b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at));

      return {
        skill,
        entries: sorted,
        days,
        // Counted from the entries, not summed off the grid: the grid now holds
        // peak effort, so adding its cells up would total ratings, not sessions.
        windowEntries: mine.filter(e => e.entry_date >= days[0].date).length,
        activeDays: activeDayCount(days),
        latest: sorted[0] ?? null,
      };
    });
}

/**
 * The archived skills, most-recently-archived first.
 *
 * Archiving is a soft delete, so an archived skill must stay *reachable* — not
 * merely undeleted in the database. Without a list you can see, putting a skill
 * down means losing it unless you remember its exact name, which makes archive
 * behave like the destructive delete it was designed not to be.
 */
export function archivedSkills(skills: readonly MonitorSkill[]): MonitorSkill[] {
  return skills
    .filter((s): s is MonitorSkill & { archived_at: string } => s.archived_at !== null)
    .sort((a, b) => b.archived_at.localeCompare(a.archived_at));
}

/** Whether this skill has already been logged today — drives the tick control. */
export function isTickedToday(summary: SkillSummary, now: Date = new Date()): boolean {
  return todaysEffort(summary, now) > 0;
}

/**
 * The hardest session logged today, 0 if none — how many effort segments the
 * tick control shows filled. Peak rather than latest, so logging an easy second
 * session after a hard one doesn't visibly demote the day.
 */
export function todaysEffort(summary: SkillSummary, now: Date = new Date()): number {
  const today = todayISO(now);
  return summary.days.find(d => d.date === today)?.count ?? 0;
}

/**
 * Consecutive days ending today with at least one entry. Zero if today is
 * untouched — a run that ended yesterday is not a run you are on.
 *
 * This is a fact on the row, not a scoreboard: nothing anywhere celebrates it,
 * warns that it is at risk, or shows it once it has broken. That is the same
 * stance ProgressHeatmap already takes by refusing streak counts outright.
 */
export function currentRunDays(summary: SkillSummary, now: Date = new Date()): number {
  const today = todayISO(now);
  const idx = summary.days.findIndex(d => d.date === today);
  if (idx < 0 || summary.days[idx].count === 0) return 0;

  let run = 0;
  for (let i = idx; i >= 0 && summary.days[i].count > 0; i--) run++;
  return run;
}

/** Whole days between a YYYY-MM-DD date and today, UTC. */
function daysSince(date: string, now: Date): number {
  const then = Date.parse(`${date}T00:00:00.000Z`);
  const today = Date.parse(`${todayISO(now)}T00:00:00.000Z`);
  return Math.round((today - then) / 86_400_000);
}

/**
 * The short right-hand label on a tick row: the run you are on if you have
 * logged today, otherwise how long it has been, otherwise that you never have.
 *
 * "never" is stated plainly rather than softened. A skill you wrote down and
 * did nothing about is the single most useful thing this view can show you, and
 * dressing it up as "not started yet" would blunt exactly that.
 */
export function touchLabel(summary: SkillSummary, now: Date = new Date()): string {
  const run = currentRunDays(summary, now);
  if (run > 0) return run === 1 ? "today" : `${run} days`;
  if (!summary.latest) return "never";

  const gap = daysSince(summary.latest.entry_date, now);
  if (gap <= 0) return "today";
  if (gap === 1) return "yesterday";
  return `last: ${gap}d`;
}

/** Today's entries for a skill, newest first. */
export function todaysEntries(summary: SkillSummary, now: Date = new Date()): MonitorSkillEntry[] {
  const today = todayISO(now);
  return summary.entries.filter(e => e.entry_date === today);
}

/**
 * The hardest *bare tick* logged today — an entry with no note — 0 if none.
 *
 * Separate from `todaysEffort` because the two controls own different things.
 * The Today picker owns bare ticks: it can replace and clear them freely,
 * because a bare tick carries nothing but its rating. A written entry is the
 * diary's, and is edited there, where you can see the sentence you are re-rating.
 */
export function todaysBareEffort(summary: SkillSummary, now: Date = new Date()): number {
  return todaysEntries(summary, now)
    .filter(e => e.note === null)
    .reduce((peak, e) => Math.max(peak, e.effort ?? EFFORT_WHEN_UNRECORDED), 0);
}

/**
 * What clicking segment `effort` on the Today picker should do.
 *
 * Three outcomes, and the reason there are three is that a hand-kept record has
 * to be correctable. The original design appended an entry per click, on the
 * grounds that two sittings in one day are real — but because a cell shades by
 * the day's *peak*, appending a lower rating changes nothing you can see. That
 * made a mis-tick permanent: rate a day 4 by accident and no click will ever
 * bring it back down. A record that can only ever be revised upward overstates,
 * which is the one thing this one must not do.
 *
 * So the picker now replaces its own tick instead of stacking a new one, and
 * clicking the segment already filled by a bare tick clears the day. A genuine
 * second session still goes in through the diary, with a line about what it was.
 */
export type TickAction =
  /** Nothing bare logged today — write the first one. */
  | { kind: "create";  effort: number }
  /** Swap today's bare ticks for a single one at the new rating. */
  | { kind: "replace"; removeIds: string[]; effort: number }
  /** Clicked the rating already showing — take the day back off the record. */
  | { kind: "clear";   removeIds: string[] };

export function resolveTick(
  summary: SkillSummary,
  effort: number,
  now: Date = new Date(),
): TickAction {
  const bare = todaysEntries(summary, now).filter(e => e.note === null);
  if (bare.length === 0) return { kind: "create", effort };

  const removeIds = bare.map(e => e.id);
  return effort === todaysBareEffort(summary, now)
    ? { kind: "clear", removeIds }
    : { kind: "replace", removeIds, effort };
}
