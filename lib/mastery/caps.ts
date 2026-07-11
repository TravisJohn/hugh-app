// ── Session cap helpers (pure, unit-tested) ─────────────────────────────────
// The app owns the hard limits. `coachTurns` counts every coach spoken turn
// INCLUDING the opener, so follow-ups are the turns after the opener.

export function followupsUsed(coachTurns: number): number {
  return Math.max(0, coachTurns - 1);
}

export function followupCapReached(coachTurns: number, maxFollowups: number): boolean {
  return followupsUsed(coachTurns) >= maxFollowups;
}
