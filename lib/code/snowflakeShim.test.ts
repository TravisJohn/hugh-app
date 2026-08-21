import { describe, it, expect } from "vitest";
import { SHIMMED_FUNCTIONS, SNOWFLAKE_MACROS, snowflakeSetup } from "./snowflakeShim";
import type { DataRow } from "./drillContent";

// The shim is what lets a Snowflake pack's cells be real Snowflake rather than
// DuckDB in disguise, and it reaches the engine through the runner's crude
// `code.split(";")`. These tests guard that seam: every promised function is
// actually declared, every declaration is replaceable (setup re-runs before
// every cell), and nothing in a macro body can be chopped in half by the split.

const ROWS: DataRow[] = [
  { id: 1, name: "Ann", amount: 10 },
  { id: 2, name: "Ben", amount: 20 },
];

describe("snowflake shim", () => {
  it("declares every function it claims to restore", () => {
    for (const fn of SHIMMED_FUNCTIONS) {
      expect(SNOWFLAKE_MACROS).toContain(`MACRO ${fn}(`);
    }
  });

  it("declares nothing it doesn't claim", () => {
    const declared = [...SNOWFLAKE_MACROS.matchAll(/MACRO (\w+)\(/g)].map(m => m[1]);
    expect([...new Set(declared)].sort()).toEqual([...SHIMMED_FUNCTIONS].sort());
  });

  it("makes every macro replaceable, because setup re-runs before every cell", () => {
    const declarations = SNOWFLAKE_MACROS.split("\n").filter(l => l.trim() !== "");
    for (const line of declarations) {
      expect(line.startsWith("CREATE OR REPLACE MACRO ")).toBe(true);
    }
  });

  it("survives the runner's split on `;` — one statement per declaration, none empty", () => {
    const statements = SNOWFLAKE_MACROS.split(";").map(s => s.trim()).filter(Boolean);
    expect(statements.length).toBe(SHIMMED_FUNCTIONS.length);
    // A `;` inside a macro body would leave a fragment that isn't a declaration.
    for (const s of statements) expect(s.startsWith("CREATE OR REPLACE MACRO ")).toBe(true);
  });

  describe("snowflakeSetup", () => {
    it("puts the macros before the table, so a cell can use them immediately", () => {
      const setup = snowflakeSetup(ROWS, "people");
      expect(setup.indexOf("MACRO iff(")).toBeLessThan(setup.indexOf("CREATE OR REPLACE TABLE people"));
    });

    it("builds the table from the same rows the drill renders", () => {
      const setup = snowflakeSetup(ROWS, "people");
      expect(setup).toContain("CREATE OR REPLACE TABLE people (id INTEGER, name VARCHAR, amount INTEGER)");
      expect(setup).toContain("(1, 'Ann', 10)");
      expect(setup).toContain("(2, 'Ben', 20)");
    });

    it("adds exactly two statements to the macro prelude — the DDL and the insert", () => {
      const count = (s: string) => s.split(";").map(x => x.trim()).filter(Boolean).length;
      expect(count(snowflakeSetup(ROWS, "people"))).toBe(count(SNOWFLAKE_MACROS) + 2);
    });
  });
});
