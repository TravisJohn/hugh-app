import { describe, it, expect } from "vitest";
import { JS_PACKS } from "./jsPacks";
import { executeCell, SHADOWED_GLOBALS } from "./jsRuntime";
import { resultVarOf } from "./drillContent";

// Every JavaScript cell is EXECUTED here, exactly the way DrillMock executes it
// in the browser: setup, then the reference solution, then the cell's own
// assertions in the same scope.
//
// The SQL packs could not do this — DuckDB is not a repo dependency, so they
// were verified once from a scratchpad and the result had to be trusted
// thereafter. JavaScript needs nothing, so the verification becomes a permanent
// CI gate instead of a one-off. A cell whose reference answer stops passing its
// own assertions fails the build, which is the only way to be sure a drill is
// never marking a correct answer wrong.

// Mirrors DrillMock: setup + (priors, when the pack builds up) + the solution.
function programFor(packIndex: number, cellIndex: number): string {
  const pack = JS_PACKS[packIndex];
  const { scenario, cells, cumulative } = pack.content;
  const priors = cumulative ? cells.slice(0, cellIndex).map(c => c.solution).join("\n") : "";
  return [scenario.setupCode, priors, cells[cellIndex].solution].filter(Boolean).join("\n");
}

describe("javascript packs", () => {
  it("ships packs, all marked as the javascript language", () => {
    expect(JS_PACKS.length).toBeGreaterThan(0);
    for (const p of JS_PACKS) {
      expect(p.lang).toBe("javascript");
      expect(p.content.lang).toBe("javascript");
    }
  });

  JS_PACKS.forEach((pack, packIndex) => {
    describe(`pack: ${pack.id}`, () => {
      pack.content.cells.forEach((cell, cellIndex) => {
        it(`cell "${cell.id}": the reference solution passes its own assertions`, async () => {
          const result = await executeCell(programFor(packIndex, cellIndex), cell.assertions);
          // Surface the runtime's message rather than a bare "false" — a broken
          // cell should say what broke.
          expect(result.error).toBeNull();
          expect(result.passed).toBe(true);
        });

        it(`cell "${cell.id}": previews a result, so the Produces panel is not blank`, async () => {
          // DrillMock finds the variable to show with resultVarOf, then runs
          // __emit on it. Authoring rule 1 in jsPacks.ts exists because a cell
          // ending in a destructuring pattern silently previews the wrong value;
          // this is the check that enforces it.
          const varName = resultVarOf(cell);
          expect(varName).not.toBeNull();

          const result = await executeCell(programFor(packIndex, cellIndex), `__emit(${varName});`);
          expect(result.passed).toBe(true);

          const last = result.stdout.trim().split("\n").pop() as string;
          const envelope = JSON.parse(last) as { kind?: string };
          expect(["table", "value"]).toContain(envelope.kind);
        });

        it(`cell "${cell.id}": is decomposed for the learner`, () => {
          // The teaching layer, not decoration: `why` is the one-line reason the
          // move matters and `narrative` is how to read the code outside-in.
          // A cell without them is a puzzle rather than a drill.
          expect(cell.why.trim()).not.toBe("");
          expect(cell.narrative?.trim()).toBeTruthy();
          expect(cell.steps?.length ?? 0).toBeGreaterThan(0);
        });
      });

      it("reaches for no network global, in any cell", () => {
        // The runtime shadows these to undefined, so a cell that used one would
        // fail at run time. Catching it in the source is a clearer message, and
        // it holds the line on drills staying offline and deterministic.
        const source = pack.content.cells.map(c => c.solution).join("\n");
        for (const name of SHADOWED_GLOBALS) {
          expect(source).not.toContain(name);
        }
      });

      it("uses only what CI's Node 20 has", () => {
        // Authoring rule 2 in jsPacks.ts. Object.groupBy landed in Node 21, so a
        // cell using it would pass locally and fail the release gate. The other
        // two mutate-free array methods are recent enough to be worth pinning as
        // well, and [...arr].sort() teaches the copy habit anyway.
        const source = pack.content.cells.map(c => c.solution).join("\n");
        for (const banned of ["Object.groupBy", ".toSorted(", ".toReversed(", ".findLast("]) {
          expect(source).not.toContain(banned);
        }
      });
    });
  });
});
