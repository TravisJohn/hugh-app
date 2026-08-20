"use client";

import StatusPill from "./StatusPill";
import type { MonitorApplication } from "@/types/monitor";

// The middle pane: everything you have sent, newest first, because the list is
// a queue of what you are waiting to hear about.

/** "2 Jul" — the year is almost always this one. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

interface Props {
  applications: MonitorApplication[];
  selectedId:   string | null;
  onSelect:     (id: string) => void;
}

export default function ApplicationList({ applications, selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {applications.map(a => (
        <button
          key={a.id}
          type="button"
          onClick={() => onSelect(a.id)}
          aria-current={selectedId === a.id ? "true" : undefined}
          className={`w-full rounded-xl border p-2.5 text-left transition-colors ${
            selectedId === a.id
              ? "border-cyan-700/60 bg-cyan-950/20"
              : "border-slate-800 bg-slate-900/20 hover:border-slate-700"
          }`}
        >
          <div className="truncate text-sm font-medium text-slate-200">{a.role_title}</div>
          <div className="truncate text-xs text-slate-500">{a.company}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusPill status={a.status} size="xs" />
            <span className="ml-auto shrink-0 text-[11px] text-slate-600">
              {shortDate(a.applied_on)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
