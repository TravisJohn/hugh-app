import { describe, it, expect } from "vitest";
import {
  QUARTER_DAYS,
  STALE_DAYS,
  verificationStatus,
  daysSinceVerified,
  factCoverage,
  describeVerification,
  reviewQueue,
} from "./provenance";
import type { Fact, Service, ServiceMeta } from "@/types/cloud";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function service(over: Partial<Service> = {}): Service {
  return {
    id: "s3",
    provider: "aws",
    name: "Amazon S3",
    groups: ["storage"],
    oneLiner: "Object storage.",
    whatItIs: "…",
    coreConcepts: [],
    whenToUse: [],
    whenNotToUse: [],
    keyFacts: [],
    pricingShape: "…",
    gotchas: [],
    equivalents: [],
    ...over,
  };
}

function fact(over: Partial<Fact> = {}): Fact {
  return { label: "Durability", value: "11 nines", ...over };
}

const SOURCE = { url: "https://docs.aws.amazon.com/x", quote: "11 9s", checked: "2026-08-20" };

describe("verificationStatus", () => {
  it("treats a missing meta as unverified, never as fine", () => {
    // The whole layer's stance: an unknown must not be quietly flattering.
    // Same reasoning as an unknown model falling back to the priciest rate.
    expect(verificationStatus(undefined, NOW)).toBe("unverified");
    expect(verificationStatus({}, NOW)).toBe("unverified");
    expect(verificationStatus({ authored: "2026-07" }, NOW)).toBe("unverified");
  });

  it("calls a check inside the last quarter verified", () => {
    expect(verificationStatus({ verified: "2026-08-20" }, NOW)).toBe("verified");
    expect(verificationStatus({ verified: "2026-06-01" }, NOW)).toBe("verified");
  });

  it("calls a check a quarter or more old aging, and two quarters stale", () => {
    const at = (days: number) =>
      new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);
    expect(verificationStatus({ verified: at(QUARTER_DAYS - 1) }, NOW)).toBe("verified");
    expect(verificationStatus({ verified: at(QUARTER_DAYS) }, NOW)).toBe("aging");
    expect(verificationStatus({ verified: at(STALE_DAYS - 1) }, NOW)).toBe("aging");
    expect(verificationStatus({ verified: at(STALE_DAYS) }, NOW)).toBe("stale");
  });

  it("treats a malformed date as unverified rather than guessing", () => {
    expect(verificationStatus({ verified: "last Tuesday" }, NOW)).toBe("unverified");
    expect(verificationStatus({ verified: "" }, NOW)).toBe("unverified");
  });

  it("treats a future date as a typo, not as a fresher check", () => {
    expect(verificationStatus({ verified: "2027-01-01" }, NOW)).toBe("unverified");
    expect(daysSinceVerified({ verified: "2027-01-01" }, NOW)).toBeNull();
  });
});

describe("factCoverage", () => {
  it("counts only facts that actually carry a source", () => {
    const facts = [fact({ source: SOURCE }), fact({ label: "SLA" }), fact({ label: "Size" })];
    expect(factCoverage(facts)).toEqual({ cited: 1, total: 3 });
  });

  it("reports zero of zero without dividing by anything", () => {
    expect(factCoverage([])).toEqual({ cited: 0, total: 0 });
  });
});

describe("describeVerification", () => {
  it("says plainly when nothing has been checked", () => {
    // A learner who never asked about provenance still has to come away knowing
    // what they are looking at.
    expect(describeVerification(undefined, NOW)).toMatch(/not yet checked/i);
    expect(describeVerification(undefined, NOW)).toMatch(/indicative/i);
  });

  it("names the date and how the check was done", () => {
    const line = describeVerification({ verified: "2026-08-20", method: "manual" }, NOW);
    expect(line).toMatch(/by hand/);
    expect(line).toContain("20 August 2026");
  });

  it("formats the date identically whatever locale the renderer is in", () => {
    // This runs during a SERVER render, so toLocaleDateString would use the
    // server's locale — "August 20, 2026" on Vercel, "20 August 2026" on a
    // machine set to en-GB. It shipped that way once and CI caught it; the
    // assertion is here so it cannot come back.
    const line = describeVerification({ verified: "2026-01-05" }, NOW);
    expect(line).toContain("5 January 2026");
    expect(line).not.toMatch(/January 5/);
  });

  it("warns as the check ages rather than presenting it as current", () => {
    const at = (days: number) =>
      new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);
    expect(describeVerification({ verified: at(120) }, NOW)).toMatch(/due for review/);
    expect(describeVerification({ verified: at(400) }, NOW)).toMatch(/expect some numbers to have changed/);
  });
});

describe("reviewQueue", () => {
  const meta = (verified?: string): ServiceMeta | undefined =>
    verified ? { verified } : undefined;

  it("puts never-checked first, then oldest, then least-cited", () => {
    const q = reviewQueue([
      service({ id: "fresh", meta: meta("2026-08-19") }),
      service({ id: "never" }),
      service({ id: "old",   meta: meta("2025-01-01") }),
      service({ id: "aging", meta: meta("2026-04-01") }),
    ], NOW);
    expect(q.map(i => i.key)).toEqual(["aws/never", "aws/old", "aws/aging", "aws/fresh"]);
  });

  it("breaks a tie on how little of the service is cited", () => {
    // Two services checked the same day are not equally known if one could only
    // source a third of its facts.
    const q = reviewQueue([
      service({ id: "well",  meta: meta("2026-08-01"), keyFacts: [fact({ source: SOURCE }), fact({ source: SOURCE })] }),
      service({ id: "thin",  meta: meta("2026-08-01"), keyFacts: [fact({ source: SOURCE }), fact()] }),
    ], NOW);
    expect(q.map(i => i.key)).toEqual(["aws/thin", "aws/well"]);
  });

  it("reports coverage and age alongside the status", () => {
    const [item] = reviewQueue([
      service({ meta: meta("2026-08-10"), keyFacts: [fact({ source: SOURCE }), fact()] }),
    ], NOW);
    expect(item).toMatchObject({
      key: "aws/s3", name: "Amazon S3", status: "verified", ageDays: 10,
      coverage: { cited: 1, total: 2 },
    });
  });
});
