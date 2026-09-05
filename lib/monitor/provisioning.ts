import { MONITOR_TABS, type MonitorTab, type MonitorView } from "@/types/monitor";

/**
 * Which of Monitor's views survive when the account is not provisioned for
 * personal documents (migration 050).
 *
 * Monitor is gated by half, not whole. "I am level 3 at SQL" and a calendar of
 * which surfaces you used are not personal data in the way a résumé is, so
 * Skills and Your Usage stay available to everyone. What goes is the job-search
 * pair — résumés, cover letters, and the applications history beside them.
 *
 * Pure, so the filtering is unit-tested rather than expressed as conditionals
 * scattered through the shell (CLAUDE.md rule 7).
 */

/** The views `monitor_docs_enabled` governs. Mirrors migration 050's tables. */
export const DOCS_VIEWS: readonly MonitorView[] = ["documents", "applications"] as const;

export function isDocsView(view: MonitorView): boolean {
  return DOCS_VIEWS.includes(view);
}

/**
 * The tab bar for this account.
 *
 * A whole tab disappears rather than a tab appearing with nothing in it: the
 * "Job Applications" tab holds exactly the two gated views, so filtering views
 * alone would leave an empty tab that looks broken.
 */
export function visibleTabs(docsEnabled: boolean): readonly MonitorTab[] {
  if (docsEnabled) return MONITOR_TABS;
  return MONITOR_TABS.filter(tab => !tab.views.some(isDocsView));
}

/**
 * The view actually to render, given what the URL asked for.
 *
 * `?view=` is user-supplied, so asking for a gated view directly must land
 * somewhere real rather than on a blank pane. Ungated views are always returned
 * untouched — losing documents must not also cost someone their usage calendar.
 */
export function resolveView(requested: MonitorView, docsEnabled: boolean): MonitorView {
  if (docsEnabled || !isDocsView(requested)) return requested;
  return "skills";
}
