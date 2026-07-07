import { describe, it, expect } from "vitest";
import { parseDrill, buildDrillPrompt, DrillParseError } from "./generateDrill";

const validCell = { task: "Create x — the total.", why: "It matters.", solution: "x = sum(r['n'] for r in rows)", assertions: "assert x == 3" };
const valid = {
  scenario: {
    title: "T", role: "R", goal: "G", outcome: "O",
    setupCode: "rows = [{'n': 1}, {'n': 2}]",
  },
  cells: [validCell, validCell, validCell],
};

describe("parseDrill", () => {
  it("parses a well-formed drill and assigns unique cell ids", () => {
    const drill = parseDrill(JSON.stringify(valid));
    expect(drill.scenario.title).toBe("T");
    expect(drill.cells).toHaveLength(3);
    expect(drill.cells.map(c => c.id)).toEqual(["c0", "c1", "c2"]);
  });

  it("tolerates markdown fences / leading prose around the JSON", () => {
    const wrapped = "Here you go:\n```json\n" + JSON.stringify(valid) + "\n```";
    expect(parseDrill(wrapped).cells).toHaveLength(3);
  });

  it("reassigns ids even when the model supplies duplicate or missing ones", () => {
    const dupe = { ...valid, cells: [{ ...validCell, id: "same" }, { ...validCell, id: "same" }, validCell] };
    const ids = parseDrill(JSON.stringify(dupe)).cells.map(c => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("accepts multi-table setups (joins) that don't use the name `rows`", () => {
    const joins = { ...valid, scenario: { ...valid.scenario, setupCode: "orders = [{'id': 1}]\ncustomers = [{'id': 1}]" } };
    expect(parseDrill(JSON.stringify(joins)).scenario.setupCode).toContain("orders");
  });

  it("throws when setupCode has no assignment (not a real dataset)", () => {
    const bad = { ...valid, scenario: { ...valid.scenario, setupCode: "some prose, no code" } };
    expect(() => parseDrill(JSON.stringify(bad))).toThrow(DrillParseError);
  });

  it("throws on too few or too many cells", () => {
    expect(() => parseDrill(JSON.stringify({ ...valid, cells: [validCell, validCell] }))).toThrow(DrillParseError);
    expect(() => parseDrill(JSON.stringify({ ...valid, cells: Array(6).fill(validCell) }))).toThrow(DrillParseError);
  });

  it("throws on a missing scenario field", () => {
    const bad = { ...valid, scenario: { ...valid.scenario, outcome: "" } };
    expect(() => parseDrill(JSON.stringify(bad))).toThrow(DrillParseError);
  });

  it("throws on non-JSON input", () => {
    expect(() => parseDrill("the model refused to answer")).toThrow(DrillParseError);
  });
});

describe("buildDrillPrompt", () => {
  it("includes topic, and context/focus only when present", () => {
    expect(buildDrillPrompt({ topic: "Airflow DAGs" })).toContain("Airflow DAGs");
    const full = buildDrillPrompt({ topic: "merges", context: "pandas track", focus: "grouping" });
    expect(full).toContain("pandas track");
    expect(full).toContain("grouping");
    expect(buildDrillPrompt({ topic: "x" })).not.toContain("Lean the drill");
  });
});
