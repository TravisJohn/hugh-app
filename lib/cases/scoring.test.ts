import { describe, it, expect } from "vitest";
import type { Case } from "@/types/cases";
import churnData from "../../public/case-data/freshbox-churn.json";
import {
  computeFlags,
  heldCount,
  diffAgainstGold,
  MUSCLE_ORDER,
} from "./scoring";

const churn = churnData as unknown as Case;

// Convenience: build a choices map straight from the gold path.
const goldChoices = churn.goldPath;

describe("computeFlags", () => {
  it("marks every muscle strong when the gold path is chosen", () => {
    const flags = computeFlags(churn, goldChoices);
    expect(flags).toEqual({
      framing_quality: "strong",
      metric_validity: "strong",
      causal_caution: "strong",
    });
  });

  it("marks a muscle weak when a weak option is chosen", () => {
    const flags = computeFlags(churn, { ...goldChoices, framing: "A" });
    expect(flags.framing_quality).toBe("weak");
    expect(flags.metric_validity).toBe("strong");
  });

  it("omits a flag when a decision was never answered", () => {
    const flags = computeFlags(churn, { framing: "B" });
    expect(flags.framing_quality).toBe("strong");
    expect(flags.metric_validity).toBeUndefined();
  });
});

describe("heldCount", () => {
  it("is 3 on the full gold path", () => {
    expect(heldCount(computeFlags(churn, goldChoices))).toBe(3);
  });

  it("drops one per weak muscle", () => {
    const flags = computeFlags(churn, {
      framing: "A", // weak
      evidence: "B", // strong
      interpretation: "A", // weak
    });
    expect(heldCount(flags)).toBe(1);
  });

  it("is 0 when nothing held", () => {
    expect(heldCount({ framing_quality: "weak", metric_validity: "weak" })).toBe(0);
  });
});

describe("diffAgainstGold", () => {
  it("returns rows in muscle arc order (Framing → Evidence → Judgment)", () => {
    const rows = diffAgainstGold(churn, goldChoices);
    expect(rows.map((r) => r.muscle)).toEqual(MUSCLE_ORDER);
    expect(rows.map((r) => r.muscleLabel)).toEqual(["Framing", "Evidence", "Judgment"]);
  });

  it("matches with no cost on the gold path", () => {
    const rows = diffAgainstGold(churn, goldChoices);
    expect(rows.every((r) => r.matched)).toBe(true);
    expect(rows.every((r) => r.cost === "")).toBe(true);
  });

  it("surfaces the chosen option's divergence cost when a path diverges", () => {
    const rows = diffAgainstGold(churn, { ...goldChoices, framing: "A", interpretation: "A" });
    const framing = rows.find((r) => r.muscle === "framing_quality")!;
    const evidence = rows.find((r) => r.muscle === "metric_validity")!;
    const judgment = rows.find((r) => r.muscle === "causal_caution")!;

    expect(framing.matched).toBe(false);
    expect(framing.cost).toMatch(/anchored on the CMO/i);
    expect(framing.yourOption.id).toBe("A");
    expect(framing.goldOption.id).toBe("B");

    expect(evidence.matched).toBe(true);
    expect(evidence.cost).toBe("");

    expect(judgment.matched).toBe(false);
    expect(judgment.cost).toMatch(/overclaimed causation/i);
  });
});
