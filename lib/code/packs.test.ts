import { describe, it, expect } from "vitest";
import { PACKS, getPack } from "./packs";

describe("practice packs", () => {
  it("has at least one pack, each with a unique id and slug-safe id", () => {
    expect(PACKS.length).toBeGreaterThan(0);
    const ids = PACKS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("getPack resolves a real id and returns undefined for a miss", () => {
    expect(getPack(PACKS[0].id)?.id).toBe(PACKS[0].id);
    expect(getPack("nope")).toBeUndefined();
  });

  for (const pack of PACKS) {
    describe(`pack: ${pack.id}`, () => {
      it("has title, blurb, tag, and a non-trivial set of reps", () => {
        expect(pack.title.trim()).not.toBe("");
        expect(pack.blurb.trim()).not.toBe("");
        expect(pack.tag.trim()).not.toBe("");
        expect(pack.content.cells.length).toBeGreaterThanOrEqual(4);
      });

      it("is independent (bite-size reps don't build on each other)", () => {
        expect(pack.content.cumulative).toBe(false);
      });

      it("setup defines a dataset and every cell is fully specified with a unique id", () => {
        expect(/=/.test(pack.content.scenario.setupCode)).toBe(true);
        const ids = pack.content.cells.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const c of pack.content.cells) {
          for (const f of [c.id, c.task, c.why, c.solution, c.assertions]) {
            expect(typeof f === "string" && f.trim() !== "").toBe(true);
          }
          expect(c.assertions).toContain("assert");
        }
      });
    });
  }
});
