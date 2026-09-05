import { describe, it, expect } from "vitest";
import { visibleTabs, resolveView, isDocsView, DOCS_VIEWS } from "./provisioning";
import { MONITOR_TABS, MONITOR_VIEWS, type MonitorView } from "@/types/monitor";

/**
 * These tests exist because gating too much is a real failure too. The privacy
 * pass removes résumés and applications from the public product; it is not
 * supposed to cost a learner their skills tracker or their usage calendar.
 */

describe("visibleTabs", () => {
  it("shows every tab to a provisioned account", () => {
    expect(visibleTabs(true)).toEqual(MONITOR_TABS);
  });

  it("removes the whole Job Applications tab, not just its views", () => {
    const ids = visibleTabs(false).map(t => t.id);

    // Filtering views alone would leave a tab with nothing under it, which
    // reads as broken rather than as unavailable.
    expect(ids).not.toContain("jobs");
  });

  it("keeps Skills and Your Usage, which hold no personal documents", () => {
    const ids = visibleTabs(false).map(t => t.id);
    expect(ids).toContain("skills");
    expect(ids).toContain("usage");
  });

  it("leaves no gated view reachable through a visible tab", () => {
    const reachable = visibleTabs(false).flatMap(t => [...t.views]);
    for (const gated of DOCS_VIEWS) {
      expect(reachable).not.toContain(gated);
    }
  });
});

describe("resolveView", () => {
  it("sends a directly-requested gated view somewhere real", () => {
    // ?view= is user-supplied. Typing it must not produce a blank pane.
    expect(resolveView("applications", false)).toBe("skills");
    expect(resolveView("documents",    false)).toBe("skills");
  });

  it("leaves gated views alone once the account is provisioned", () => {
    expect(resolveView("applications", true)).toBe("applications");
    expect(resolveView("documents",    true)).toBe("documents");
  });

  it("never redirects an ungated view", () => {
    // The regression this guards: gating documents must not also cost someone
    // their usage calendar, which contains nothing personal.
    for (const view of MONITOR_VIEWS.filter(v => !isDocsView(v))) {
      expect(resolveView(view, false)).toBe(view);
    }
  });

  it("always resolves to a view that is actually reachable", () => {
    for (const view of MONITOR_VIEWS) {
      const resolved: MonitorView = resolveView(view, false);
      const reachable = visibleTabs(false).flatMap(t => [...t.views]);
      expect(reachable).toContain(resolved);
    }
  });
});
