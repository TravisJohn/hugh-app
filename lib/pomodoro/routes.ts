// Shared route rules for the Pomodoro widget + focus music.

// Routes where the timer (and music) disappear entirely: focused assessments, the
// admin/tools area (not a study context), the Code activity (its own focused mode,
// not part of the learn flow), the Notes workspace (which has its OWN self-contained
// timer, so the learn-flow one must not bleed in), and the coming-soon Converse.
// The Converse route doesn't exist yet — future-proofed.
export function isSilentRoute(path: string): boolean {
  return /^\/admin(\/|$)/.test(path)
    || /^\/review\//.test(path)
    || /^\/mastery\//.test(path)
    || /^\/code(\/|$)/.test(path)
    || /^\/notes(\/|$)/.test(path)
    || /^\/converse(\/|$)/.test(path);
}

// Pages that carry their own inline timer control (the Ask chat toolbar). The
// floating dock countdown is hidden there to avoid showing two of the same timer.
export function isAskRoute(path: string): boolean {
  return path === "/learn" || /^\/study\/[^/]+\/ask$/.test(path);
}
