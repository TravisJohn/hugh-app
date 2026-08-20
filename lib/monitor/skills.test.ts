import { describe, it, expect } from "vitest";
import {
  normaliseSkillName,
  normaliseSkillNote,
  todayISO,
  isValidEntryDate,
  skillKey,
  findDuplicateSkill,
  summariseSkills,
  archivedSkills,
  normaliseEffort,
  todaysEffort,
  EFFORT_WHEN_UNRECORDED,
  isTickedToday,
  currentRunDays,
  touchLabel,
  MONITOR_WINDOW_DAYS,
  SKILL_NAME_MAX,
  SKILL_NOTE_MAX,
} from "./skills";
import type { MonitorSkill, MonitorSkillEntry } from "@/types/monitor";

const NOW = new Date("2026-06-17T12:00:00.000Z");

function skill(over: Partial<MonitorSkill> = {}): MonitorSkill {
  return {
    id: "s1",
    user_id: "u1",
    name: "Window functions",
    created_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
    ...over,
  };
}

function entry(over: Partial<MonitorSkillEntry> = {}): MonitorSkillEntry {
  return {
    id: "e1",
    skill_id: "s1",
    user_id: "u1",
    entry_date: "2026-06-17",
    note: null,
    effort: null,
    created_at: "2026-06-17T09:00:00.000Z",
    ...over,
  };
}

describe("normaliseSkillName", () => {
  it("trims and collapses runs of whitespace", () => {
    expect(normaliseSkillName("  window   functions  ")).toBe("window functions");
  });

  it("rejects a name that is only whitespace rather than creating a blank row", () => {
    // Typing spaces and hitting enter should do nothing, not add an unnameable
    // skill the learner then has to find and archive.
    expect(normaliseSkillName("   ")).toBeNull();
    expect(normaliseSkillName("")).toBeNull();
  });

  it("rejects non-string input from an untrusted request body", () => {
    expect(normaliseSkillName(undefined)).toBeNull();
    expect(normaliseSkillName(42)).toBeNull();
    expect(normaliseSkillName({ name: "x" })).toBeNull();
  });

  it("caps an over-long name instead of rejecting it", () => {
    // A pasted paragraph should become a usable title, not an error the learner
    // has to interpret.
    const out = normaliseSkillName("a".repeat(SKILL_NAME_MAX + 50));
    expect(out).toHaveLength(SKILL_NAME_MAX);
  });
});

describe("normaliseSkillNote", () => {
  it("returns null for an absent or empty note, so ticking without a note is legal", () => {
    // Forcing a sentence would make the honest record harder to keep than the
    // dishonest one.
    expect(normaliseSkillNote(undefined)).toBeNull();
    expect(normaliseSkillNote("   ")).toBeNull();
  });

  it("keeps a real note, trimmed", () => {
    expect(normaliseSkillNote("  finally got RANGE vs ROWS  ")).toBe("finally got RANGE vs ROWS");
  });

  it("caps an over-long note", () => {
    expect(normaliseSkillNote("x".repeat(SKILL_NOTE_MAX + 100))).toHaveLength(SKILL_NOTE_MAX);
  });
});

describe("todayISO", () => {
  it("returns the UTC calendar day, ignoring the time of day", () => {
    expect(todayISO(new Date("2026-06-17T23:59:59.999Z"))).toBe("2026-06-17");
    expect(todayISO(new Date("2026-06-17T00:00:00.000Z"))).toBe("2026-06-17");
  });
});

describe("isValidEntryDate", () => {
  it("accepts today", () => {
    expect(isValidEntryDate("2026-06-17", NOW)).toBe(true);
  });

  it("accepts a past date, because backdating a hand-kept record is normal", () => {
    expect(isValidEntryDate("2026-05-02", NOW)).toBe(true);
  });

  it("rejects a future date, which would shade a cell beyond the end of the grid", () => {
    expect(isValidEntryDate("2026-06-18", NOW)).toBe(false);
    expect(isValidEntryDate("2027-01-01", NOW)).toBe(false);
  });

  it("rejects a date that does not exist rather than rolling it into the next month", () => {
    // new Date("2026-02-31") silently becomes 3 March; without the round-trip
    // check that would be stored as a real entry on the wrong day.
    expect(isValidEntryDate("2026-02-31", NOW)).toBe(false);
    expect(isValidEntryDate("2026-13-01", NOW)).toBe(false);
  });

  it("rejects anything that is not a YYYY-MM-DD string", () => {
    expect(isValidEntryDate("17/06/2026", NOW)).toBe(false);
    expect(isValidEntryDate("2026-06-17T09:00:00Z", NOW)).toBe(false);
    expect(isValidEntryDate(20260617, NOW)).toBe(false);
    expect(isValidEntryDate(null, NOW)).toBe(false);
  });
});

describe("skillKey / findDuplicateSkill", () => {
  it("treats case and spacing differences as the same skill", () => {
    // Otherwise "Window Functions" becomes a second row beside "window
    // functions", and the history splits in half across two heatmaps.
    expect(skillKey("Window  Functions")).toBe(skillKey("window functions"));
  });

  it("finds an existing skill by folded name", () => {
    const skills = [skill({ id: "a", name: "Window functions" })];
    expect(findDuplicateSkill(skills, "  WINDOW FUNCTIONS ")?.id).toBe("a");
  });

  it("returns null when the name is genuinely new", () => {
    expect(findDuplicateSkill([skill()], "Polars")).toBeNull();
  });

  it("still matches an archived skill, so re-adding surfaces the old one", () => {
    // Silently creating a fresh skill would strand the learner's existing
    // history under a name they can no longer see.
    const archived = [skill({ id: "a", archived_at: "2026-05-01T00:00:00.000Z" })];
    expect(findDuplicateSkill(archived, "Window functions")?.id).toBe("a");
  });
});

describe("summariseSkills", () => {
  it("gives every skill a full zero-filled window, even one never touched", () => {
    // A brand-new skill must render as an empty grid, not as nothing at all —
    // the empty grid is what tells the learner where their ticks will appear.
    const [s] = summariseSkills([skill()], [], NOW);
    expect(s.days).toHaveLength(MONITOR_WINDOW_DAYS);
    expect(s.activeDays).toBe(0);
    expect(s.windowEntries).toBe(0);
    expect(s.latest).toBeNull();
  });

  it("counts several entries on one day as several sessions", () => {
    // This is why monitor_skill_entries has no unique constraint on
    // (skill_id, entry_date): two sittings in a day are two entries.
    const entries = [
      entry({ id: "a", entry_date: "2026-06-17" }),
      entry({ id: "b", entry_date: "2026-06-17" }),
      entry({ id: "c", entry_date: "2026-06-17" }),
    ];
    const [s] = summariseSkills([skill()], entries, NOW);
    expect(s.windowEntries).toBe(3);
    expect(s.activeDays).toBe(1);
  });

  it("shades a day by its hardest session, not by how many it held", () => {
    // The chosen meaning of the grid: "how hard did I go", not "how often did
    // I show up". Three easy sessions must not out-shade one hard one.
    const easyDay = summariseSkills([skill()], [
      entry({ id: "a", entry_date: "2026-06-16", effort: 2 }),
      entry({ id: "b", entry_date: "2026-06-16", effort: 2 }),
      entry({ id: "c", entry_date: "2026-06-16", effort: 2 }),
    ], NOW)[0];
    const hardDay = summariseSkills([skill()], [
      entry({ id: "d", entry_date: "2026-06-16", effort: 5 }),
    ], NOW)[0];

    const cell = (s: typeof easyDay) => s.days[s.days.length - 2].count;
    expect(cell(easyDay)).toBe(2);
    expect(cell(hardDay)).toBe(5);
  });

  it("counts an unrated entry as the lightest effort rather than inventing one", () => {
    // A bare tick says "I touched this" and nothing more. Reading it as
    // anything higher would claim effort nobody entered.
    const [s] = summariseSkills([skill()], [entry({ effort: null })], NOW);
    expect(s.days[s.days.length - 1].count).toBe(EFFORT_WHEN_UNRECORDED);
  });

  it("lets a rated session outrank an unrated one on the same day", () => {
    const [s] = summariseSkills([skill()], [
      entry({ id: "a", effort: null }),
      entry({ id: "b", effort: 4 }),
    ], NOW);
    expect(s.days[s.days.length - 1].count).toBe(4);
  });

  it("still counts sessions, not ratings, in windowEntries", () => {
    // windowEntries is derived from the entries rather than summed off the
    // grid — the grid now holds peak effort, so adding its cells would total
    // ratings and report "13 entries" for three sessions.
    const [s] = summariseSkills([skill()], [
      entry({ id: "a", entry_date: "2026-06-17", effort: 5 }),
      entry({ id: "b", entry_date: "2026-06-16", effort: 4 }),
      entry({ id: "c", entry_date: "2026-06-15", effort: 4 }),
    ], NOW);
    expect(s.windowEntries).toBe(3);
  });

  it("keeps each skill's entries to itself", () => {
    const skills = [skill({ id: "s1" }), skill({ id: "s2", name: "Polars", created_at: "2026-02-01T00:00:00.000Z" })];
    const entries = [entry({ skill_id: "s1" }), entry({ id: "e2", skill_id: "s2" }), entry({ id: "e3", skill_id: "s2" })];
    const out = summariseSkills(skills, entries, NOW);
    expect(out.find(s => s.skill.id === "s1")!.windowEntries).toBe(1);
    expect(out.find(s => s.skill.id === "s2")!.windowEntries).toBe(2);
  });

  it("hides archived skills", () => {
    const skills = [skill({ id: "s1" }), skill({ id: "s2", archived_at: "2026-06-01T00:00:00.000Z" })];
    expect(summariseSkills(skills, [], NOW).map(s => s.skill.id)).toEqual(["s1"]);
  });

  it("orders by when the skill was added, not by recent activity", () => {
    // The list is a record of what you set out to learn; it must not reshuffle
    // under the cursor every time something is ticked.
    const skills = [
      skill({ id: "late", created_at: "2026-03-01T00:00:00.000Z" }),
      skill({ id: "early", created_at: "2026-01-01T00:00:00.000Z" }),
    ];
    const entries = [entry({ skill_id: "late" })];
    expect(summariseSkills(skills, entries, NOW).map(s => s.skill.id)).toEqual(["early", "late"]);
  });

  it("lists a skill's own entries newest first, whatever order they arrived in", () => {
    // The hook prepends a newly-logged entry to an unsorted list, so the sort
    // has to happen here — otherwise a backdated entry lands at the top of the
    // diary and reads as the most recent thing that happened.
    const entries = [
      entry({ id: "mid", entry_date: "2026-06-12" }),
      entry({ id: "new", entry_date: "2026-06-16" }),
      entry({ id: "old", entry_date: "2026-06-10" }),
    ];
    expect(summariseSkills([skill()], entries, NOW)[0].entries.map(e => e.id))
      .toEqual(["new", "mid", "old"]);
  });

  it("picks the latest entry by date, not by insertion order", () => {
    const entries = [
      entry({ id: "old", entry_date: "2026-06-10", note: "old" }),
      entry({ id: "new", entry_date: "2026-06-16", note: "new" }),
      entry({ id: "mid", entry_date: "2026-06-12", note: "mid" }),
    ];
    expect(summariseSkills([skill()], entries, NOW)[0].latest?.note).toBe("new");
  });

  it("breaks a same-day tie by when the entry was written", () => {
    const entries = [
      entry({ id: "a", entry_date: "2026-06-16", created_at: "2026-06-16T08:00:00.000Z", note: "morning" }),
      entry({ id: "b", entry_date: "2026-06-16", created_at: "2026-06-16T20:00:00.000Z", note: "evening" }),
    ];
    expect(summariseSkills([skill()], entries, NOW)[0].latest?.note).toBe("evening");
  });

  it("reports an entry older than the window as latest, though it shades no cell", () => {
    // "Last touched in December" is exactly what a stale skill should say. The
    // grid is empty; the line underneath is not.
    const entries = [entry({ entry_date: "2025-08-01", note: "ages ago" })];
    const [s] = summariseSkills([skill()], entries, NOW);
    expect(s.windowEntries).toBe(0);
    expect(s.latest?.note).toBe("ages ago");
  });
});

describe("archivedSkills", () => {
  it("returns only archived skills — the ones summariseSkills hides", () => {
    // The two must be exact complements, or a skill can vanish from both lists
    // and become unreachable without knowing its name.
    const skills = [
      skill({ id: "live" }),
      skill({ id: "gone", archived_at: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(archivedSkills(skills).map(s => s.id)).toEqual(["gone"]);
    expect(summariseSkills(skills, [], NOW).map(s => s.skill.id)).toEqual(["live"]);
  });

  it("puts the most recently archived first, so undoing a mistake is one glance", () => {
    const skills = [
      skill({ id: "old", archived_at: "2026-01-01T00:00:00.000Z" }),
      skill({ id: "new", archived_at: "2026-06-01T00:00:00.000Z" }),
      skill({ id: "mid", archived_at: "2026-03-01T00:00:00.000Z" }),
    ];
    expect(archivedSkills(skills).map(s => s.id)).toEqual(["new", "mid", "old"]);
  });

  it("returns nothing when nothing is archived", () => {
    expect(archivedSkills([skill()])).toEqual([]);
    expect(archivedSkills([])).toEqual([]);
  });
});

describe("normaliseEffort", () => {
  it("accepts the five steps of the scale", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(normaliseEffort(n)).toBe(n);
  });

  it("rejects an out-of-range number rather than clamping it", () => {
    // Clamping a 9 to 5 would silently promote a typo into the strongest claim
    // the scale can make.
    expect(normaliseEffort(0)).toBeNull();
    expect(normaliseEffort(6)).toBeNull();
    expect(normaliseEffort(9)).toBeNull();
    expect(normaliseEffort(-2)).toBeNull();
  });

  it("rejects non-integers and non-numbers from an untrusted body", () => {
    expect(normaliseEffort(3.5)).toBeNull();
    expect(normaliseEffort("4")).toBeNull();
    expect(normaliseEffort(null)).toBeNull();
    expect(normaliseEffort(undefined)).toBeNull();
    expect(normaliseEffort(NaN)).toBeNull();
  });
});

describe("todaysEffort", () => {
  it("reports the hardest session logged today", () => {
    const s = summariseSkills([skill()], [
      entry({ id: "a", effort: 2 }),
      entry({ id: "b", effort: 5 }),
      entry({ id: "c", effort: 3 }),
    ], NOW)[0];
    expect(todaysEffort(s, NOW)).toBe(5);
  });

  it("does not demote the day when an easy session follows a hard one", () => {
    // Peak, not latest: a quick top-up after a long sitting shouldn't visibly
    // undo the long sitting.
    const s = summariseSkills([skill()], [
      entry({ id: "hard", effort: 5, created_at: "2026-06-17T09:00:00.000Z" }),
      entry({ id: "easy", effort: 1, created_at: "2026-06-17T21:00:00.000Z" }),
    ], NOW)[0];
    expect(todaysEffort(s, NOW)).toBe(5);
  });

  it("is zero when today is untouched", () => {
    expect(todaysEffort(summariseSkills([skill()], [], NOW)[0], NOW)).toBe(0);
  });
});

describe("isTickedToday / currentRunDays / touchLabel", () => {
  const sum = (dates: string[]) => summariseSkills([skill()], dates.map((d, i) =>
    entry({ id: `e${i}`, entry_date: d, created_at: `${d}T09:00:00.000Z` })), NOW)[0];

  it("knows whether today has been logged", () => {
    expect(isTickedToday(sum(["2026-06-17"]), NOW)).toBe(true);
    expect(isTickedToday(sum(["2026-06-16"]), NOW)).toBe(false);
    expect(isTickedToday(sum([]), NOW)).toBe(false);
  });

  it("counts consecutive days ending today", () => {
    expect(currentRunDays(sum(["2026-06-15", "2026-06-16", "2026-06-17"]), NOW)).toBe(3);
  });

  it("reports no run when today is untouched, even after a long streak", () => {
    // A run that ended yesterday is not a run you are on. Reporting it would
    // turn the number into something you can be shown losing.
    expect(currentRunDays(sum(["2026-06-14", "2026-06-15", "2026-06-16"]), NOW)).toBe(0);
  });

  it("does not jump a gap when counting a run", () => {
    expect(currentRunDays(sum(["2026-06-14", "2026-06-17"]), NOW)).toBe(1);
  });

  it("counts a day with several entries once toward the run", () => {
    const s = summariseSkills([skill()], [
      entry({ id: "a", entry_date: "2026-06-17" }),
      entry({ id: "b", entry_date: "2026-06-17" }),
    ], NOW)[0];
    expect(currentRunDays(s, NOW)).toBe(1);
  });

  it("labels a live run in days, and a single day as today", () => {
    expect(touchLabel(sum(["2026-06-17"]), NOW)).toBe("today");
    expect(touchLabel(sum(["2026-06-16", "2026-06-17"]), NOW)).toBe("2 days");
  });

  it("labels a lapsed skill by how long it has been", () => {
    expect(touchLabel(sum(["2026-06-16"]), NOW)).toBe("yesterday");
    expect(touchLabel(sum(["2026-06-11"]), NOW)).toBe("last: 6d");
  });

  it("says never, plainly, for a skill written down and never touched", () => {
    // The single most useful thing this view can show. Softening it to "not
    // started yet" would blunt exactly that.
    expect(touchLabel(sum([]), NOW)).toBe("never");
  });

  it("still labels a skill whose last entry predates the heatmap window", () => {
    expect(touchLabel(sum(["2025-08-01"]), NOW)).toBe("last: 320d");
  });
});
