// ── Cloud Skills provenance — how fresh is this write-up? ───────────────────
// Pure: no React, no fs, no clock of its own — callers inject `now`.
//
// The content is AI-authored, and cloud services move. The honest response is
// not to claim uniform authority over 63 write-ups; it is to say, per service,
// when it was last checked and against what. Everything here derives that from
// the dates in `meta` rather than storing a status — a stored "verified" flag
// would itself go stale, which is precisely the failure this layer exists to fix.

import type { Fact, Service, ServiceMeta } from "@/types/cloud";

/**
 * The review cadence. A quarter, because that is the pace a solo maintainer can
 * actually sustain across 63 services — a cadence nobody keeps is worse than a
 * long one honestly stated.
 */
export const QUARTER_DAYS = 90;

/** Past two quarters unchecked, a write-up is no longer "recently reviewed". */
export const STALE_DAYS = QUARTER_DAYS * 2;

export type VerificationStatus =
  /** Checked within the last quarter. */
  | "verified"
  /** Checked, but a quarter or more ago — due for the next pass. */
  | "aging"
  /** Checked, but two quarters or more ago. Say so plainly. */
  | "stale"
  /** Never checked against a source. The default, and never softened. */
  | "unverified";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "20 August 2026" — formatted explicitly, never via toLocaleDateString.
 *
 * This string is produced during a SERVER render, so a locale-aware formatter
 * would use the server's locale (en-US on Vercel), not the learner's — the date
 * would silently change shape between a dev machine and production while looking
 * correct in both. Same reasoning as Monitor computing its header date in UTC
 * rather than in a client effect. Client components, where the reader's own
 * locale really is the right one, still use toLocaleDateString.
 */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS[m - 1];
  return month ? `${d} ${month} ${y}` : iso;
}

/** Whole days between a YYYY-MM-DD date and now, UTC. Negative for the future. */
function daysSince(date: string, now: Date): number | null {
  const then = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(then)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - then) / 86_400_000);
}

/**
 * How fresh this service's verification is.
 *
 * A missing `meta`, a missing `verified`, and an unparseable date all return
 * "unverified" rather than throwing or guessing. A malformed date is exactly
 * when a system is most tempted to assume the best; assuming the worst is what
 * keeps the label trustworthy.
 */
export function verificationStatus(
  meta: ServiceMeta | undefined,
  now: Date = new Date(),
): VerificationStatus {
  if (!meta?.verified) return "unverified";
  const age = daysSince(meta.verified, now);
  if (age === null) return "unverified";
  // A future date is a typo, not a fresher check.
  if (age < 0) return "unverified";
  if (age < QUARTER_DAYS) return "verified";
  if (age < STALE_DAYS) return "aging";
  return "stale";
}

/** Age in days of the last check, or null if there has never been one. */
export function daysSinceVerified(
  meta: ServiceMeta | undefined,
  now: Date = new Date(),
): number | null {
  if (!meta?.verified) return null;
  const age = daysSince(meta.verified, now);
  return age === null || age < 0 ? null : age;
}

export interface FactCoverage {
  /** Key facts carrying a source quote. */
  cited: number;
  total: number;
}

/**
 * How much of a service's key facts actually carry a citation.
 *
 * Reported alongside the date because the two say different things: a service
 * checked yesterday where only two of six facts could be sourced is not the
 * same as one where all six were. Collapsing them into a single "verified" tick
 * would overstate the weaker case.
 */
export function factCoverage(facts: readonly Fact[]): FactCoverage {
  return {
    cited: facts.filter(f => f.source !== undefined).length,
    total: facts.length,
  };
}

/**
 * The line shown to a learner. Written to be read by someone who did not ask
 * about provenance and should still come away knowing what they are looking at.
 */
export function describeVerification(
  meta: ServiceMeta | undefined,
  now: Date = new Date(),
): string {
  const status = verificationStatus(meta, now);
  if (status === "unverified") {
    return "Not yet checked against official documentation — treat limits and numbers as indicative.";
  }

  const on = formatDay(meta!.verified!);
  const how = meta!.method === "pipeline" ? "Checked" : "Checked by hand";

  if (status === "verified") return `${how} against official documentation on ${on}.`;
  if (status === "aging") {
    return `${how} against official documentation on ${on} — due for review, so numbers may have moved.`;
  }
  return `${how} against official documentation on ${on}, over six months ago — expect some numbers to have changed.`;
}

export interface ReviewItem {
  key: string;
  name: string;
  status: VerificationStatus;
  ageDays: number | null;
  coverage: FactCoverage;
}

/**
 * The review queue, worst first.
 *
 * Ordering is by how little is known about a service, not alphabetically: never
 * checked, then longest since checked, then least-cited. The point of the queue
 * is to answer "what should I look at next" without reading it all.
 */
export function reviewQueue(
  services: readonly Service[],
  now: Date = new Date(),
): ReviewItem[] {
  const rank: Record<VerificationStatus, number> = {
    unverified: 0, stale: 1, aging: 2, verified: 3,
  };

  return services
    .map(s => ({
      key:      `${s.provider}/${s.id}`,
      name:     s.name,
      status:   verificationStatus(s.meta, now),
      ageDays:  daysSinceVerified(s.meta, now),
      coverage: factCoverage(s.keyFacts),
    }))
    .sort((a, b) =>
      rank[a.status] - rank[b.status] ||
      (b.ageDays ?? 0) - (a.ageDays ?? 0) ||
      (a.coverage.cited / (a.coverage.total || 1)) - (b.coverage.cited / (b.coverage.total || 1)) ||
      a.key.localeCompare(b.key));
}
