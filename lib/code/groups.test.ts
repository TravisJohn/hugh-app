import { describe, it, expect } from "vitest";
import { DRILL_LANGS } from "@/types/code";
import { PACKS } from "./packs";
import {
  CODE_GROUPS,
  groupOfPack,
  groupsForLang,
  packIdsForLang,
  type CodeGroup,
} from "./groups";

// The grouping is what the /code/start map renders from. Before grouping, a new
// pack appeared on the landing automatically just by being in PACKS; now an
// unfiled pack is invisible to the user with no other symptom. The
// "every pack belongs to exactly one group" test below is the guard that turns
// that silent disappearance into a failing build — it is the reason this file
// exists, so don't relax it when adding packs. File the pack instead.

describe("code groups", () => {
  it("has groups with unique, slug-safe ids", () => {
    expect(CODE_GROUPS.length).toBeGreaterThan(0);
    const ids = CODE_GROUPS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("every pack belongs to exactly one group", () => {
    const filed = CODE_GROUPS.flatMap(g => g.packIds);

    // Unfiled packs would silently vanish from the landing.
    const unfiled = PACKS.filter(p => !filed.includes(p.id)).map(p => p.id);
    expect(unfiled).toEqual([]);

    // A pack in two groups would render as two different leaves, so its heat
    // and progress would read as two separate practice histories.
    const duplicated = filed.filter((id, i) => filed.indexOf(id) !== i);
    expect(duplicated).toEqual([]);
  });

  it("references no pack ids that don't exist", () => {
    const real = new Set(PACKS.map(p => p.id));
    const dangling = CODE_GROUPS.flatMap(g => g.packIds).filter(id => !real.has(id));
    expect(dangling).toEqual([]);
  });

  it("gives every group a non-empty label, tagline, icon and hex accent", () => {
    for (const g of CODE_GROUPS) {
      expect(g.label.trim()).not.toBe("");
      expect(g.tagline.trim()).not.toBe("");
      expect(g.icon.trim()).not.toBe("");
      // Hex, not a Tailwind class — the SVG connectors need a real colour.
      expect(g.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(g.packIds.length).toBeGreaterThan(0);
    }
  });

  it("gives each group a distinct accent so branches stay tellable apart", () => {
    const accents = CODE_GROUPS.map(g => g.accent.toLowerCase());
    expect(new Set(accents).size).toBe(accents.length);
  });

  // The expanded branch has to fit the viewport without scrolling (the project's
  // no-scroll rule). The layout is built for two columns of leaves; past this
  // many the branch overflows on a short viewport, so a group that grows too
  // large should be split rather than allowed to silently break the layout.
  it("keeps every group within the leaf budget the branch layout can fit", () => {
    for (const g of CODE_GROUPS) {
      for (const lang of DRILL_LANGS) {
        expect(packIdsForLang(g, lang).length).toBeLessThanOrEqual(8);
      }
    }
  });

  describe("groupOfPack", () => {
    it("resolves a real pack and returns undefined for a miss", () => {
      expect(groupOfPack("rag")?.id).toBe("ai-retrieval");
      expect(groupOfPack("nope")).toBeUndefined();
    });
  });

  describe("language filtering", () => {
    it("packIdsForLang keeps authored order and drops other languages", () => {
      const analysis = CODE_GROUPS.find(g => g.id === "analysis") as CodeGroup;

      const python = packIdsForLang(analysis, "python");
      expect(python).toEqual(["clean-shape", "explore", "build-chart", "linear-regression", "forecasting"]);

      const sql = packIdsForLang(analysis, "sql");
      expect(sql.every(id => id.startsWith("sql-"))).toBe(true);
      expect(sql.length).toBe(5);

      // The Snowflake territory is SQL-only, so the Python pill sees nothing there.
      const snowflake = CODE_GROUPS.find(g => g.id === "snowflake") as CodeGroup;
      expect(packIdsForLang(snowflake, "python")).toEqual([]);
      expect(packIdsForLang(snowflake, "sql").every(id => id.startsWith("snowflake-"))).toBe(true);
    });

    it("hides groups that have no packs in the active language", () => {
      // Snowflake is the only SQL-only territory, so the Python pill must not
      // render it; and the SQL pill must not render the Python-only ones.
      const python = groupsForLang("python").map(g => g.id);
      expect(python).toEqual(CODE_GROUPS.map(g => g.id).filter(id => id !== "snowflake"));
      expect(groupsForLang("sql").map(g => g.id)).toEqual(["analysis", "snowflake"]);
    });

    it("accounts for every pack of a language across the visible groups", () => {
      for (const lang of DRILL_LANGS) {
        const shown = groupsForLang(lang).flatMap(g => packIdsForLang(g, lang)).sort();
        const all = PACKS.filter(p => p.lang === lang).map(p => p.id).sort();
        expect(shown).toEqual(all);
      }
    });
  });
});
