"use client";

import Link from "next/link";
import { ArrowLeft, Activity } from "lucide-react";
import {
  useMonitorView, useMonitorSkills, useMonitorApplications,
  useMonitorDocuments, useMonitorUsage,
} from "@/hooks/useMonitor";
import { MONITOR_TABS, VIEW_LABEL, tabForView } from "@/types/monitor";
import SkillsView from "./SkillsView";
import ApplicationsView from "./ApplicationsView";
import DocumentsView from "./DocumentsView";
import UsageView from "./UsageView";

// Monitor: three views under one shell, one home card, one mental model.
//
// The page is locked to the viewport and its panes scroll internally — the same
// exception /notes has, and for the same reason. Monitor is a records tool: six
// skills fit a screen, forty applications and a year of diary entries do not.
// See CLAUDE.md Architecture Rule 4.
//
// Nothing on this surface calls a model. Monitor records; it does not teach.

export default function MonitorShell({ today }: { today: string }) {
  const [view, setView] = useMonitorView();
  const activeTab = tabForView(view);
  const skills = useMonitorSkills();
  const apps   = useMonitorApplications();
  const docs   = useMonitorDocuments();
  const usage  = useMonitorUsage();

  // One banner, whichever view raised the error. Both hooks surface failures
  // rather than swallowing them; the shell is where they get shown.
  const error   = skills.error ?? apps.error ?? docs.error ?? usage.error;
  const dismiss = () => { skills.dismissError(); apps.dismissError(); docs.dismissError(); };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0F1E] text-slate-200">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-800 px-5 py-3">
        <Link
          href="/home"
          className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">Home</span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-400">
            <Activity size={14} />
          </span>
          <span className="font-semibold tracking-tight text-slate-100">Monitor</span>
        </div>

        {/* Three tabs over four views: résumés and applications are one activity,
            so they share a tab and separate below it. Clicking a tab lands on
            its first view — the library, because a document has to exist before
            an application can be sent with it. */}
        <nav className="ml-2 flex items-center gap-1">
          {MONITOR_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.views[0])}
              aria-current={activeTab.id === t.id ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab.id === t.id
                  ? "bg-cyan-500/15 text-cyan-300"
                  : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <span className="ml-auto hidden text-xs text-slate-600 sm:block">{today}</span>
      </header>

      {/* ── Sub-navigation ──────────────────────────────────────────── */}
      {activeTab.views.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 border-b border-slate-800 px-5 py-1.5">
          {activeTab.views.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-current={view === v ? "true" : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === v
                  ? "bg-slate-800 text-slate-200"
                  : "text-slate-600 hover:bg-slate-800/50 hover:text-slate-400"
              }`}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      )}

      {/* ── Error banner ────────────────────────────────────────────── */}
      {/* Failures are shown, never swallowed — a tick that silently didn't save
          would make the record quietly wrong, which is the one thing a record
          must not be. */}
      {error && (
        <div className="flex shrink-0 items-center gap-3 border-b border-red-900/50 bg-red-950/40 px-5 py-2 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={dismiss}
            className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-900/40"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── The active view ─────────────────────────────────────────── */}
      {/* min-h-0 is what keeps the page itself from scrolling: without it a
          flex child refuses to shrink below its content and pushes the body
          past the viewport. */}
      <main className="flex min-h-0 flex-1 flex-col">
        {view === "skills"       && <SkillsView state={skills} />}
        {view === "applications" && <ApplicationsView state={apps} docs={docs} onOpenLibrary={() => setView("documents")} />}
        {view === "documents"    && <DocumentsView docs={docs} apps={apps} />}
        {view === "usage"        && <UsageView state={usage} />}
      </main>
    </div>
  );
}
