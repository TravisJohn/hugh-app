"use client";

import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";
import type { MonitorApplicationsState, MonitorDocumentsState } from "@/hooks/useMonitor";
import ApplicationChart from "./ApplicationChart";
import ApplicationList from "./ApplicationList";
import ApplicationDetail from "./ApplicationDetail";
import DocumentLibrary from "./DocumentLibrary";
import AttachPane from "./AttachPane";

// Applications — three panes, shaped like /notes: the numbers on the left, the
// list in the middle, the documents on the right. Each pane scrolls internally;
// the page does not.
//
// This is the one surface in Hugh that is career admin rather than learning, so
// the subheading says exactly that rather than letting someone discover it.
// Nothing here is sent to a model — it widens what Hugh holds, not what Hugh
// teaches.

export default function ApplicationsView({ state, docs, onOpenLibrary }: {
  state: MonitorApplicationsState;
  docs:  MonitorDocumentsState;
  /** Jump to the Documents tab — the library is managed there, not here. */
  onOpenLibrary: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  if (state.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-600">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const { stats } = state;

  return (
    <div className="flex min-h-0 flex-1 gap-4 p-4">

      {/* ── Left: the numbers ───────────────────────────────────────── */}
      <section className={`flex min-h-0 shrink-0 flex-col overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/30 p-3 transition-[width] ${attachOpen ? "w-[228px]" : "w-[280px]"}`}>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat label="Sent"       value={stats.sent}
                note={stats.since ? `since ${longDate(stats.since)}` : "nothing yet"} />
          <Stat label="Live"       value={stats.live}       note="not yet closed" />
          <Stat label="Interviews" value={stats.interviews}
                note={stats.sent > 0 ? `${stats.interviewRate}% of sent` : "—"} />
          <Stat label="Offers"     value={stats.offers}
                note={stats.offerCompany ?? (stats.offers > 1 ? "and counting" : "—")} />
        </div>

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Applications per day <span className="normal-case text-slate-700">· 8 weeks</span>
        </p>
        {stats.sent === 0
          ? <p className="text-xs leading-relaxed text-slate-600">
              The chart fills in as you record applications — each bar coloured by
              where that application stands now.
            </p>
          : <ApplicationChart columns={state.chart} />}

        {/* The library sits under the chart because both answer the same
            question: is any of this working? */}
        <DocumentLibrary
          documents={docs.documents}
          versions={docs.versions}
          applications={state.applications}
          events={state.events}
        />
      </section>

      {/* ── Middle: the list ────────────────────────────────────────── */}
      <section className={`flex min-h-0 shrink-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/30 transition-[width] ${attachOpen ? "w-[196px]" : "w-[240px]"}`}>
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-slate-300">All applications</h2>
          <span className="text-xs text-slate-600">{state.applications.length}</span>
          <button
            type="button"
            onClick={() => setAdding(a => !a)}
            title={adding ? "Cancel" : "Record an application"}
            aria-label={adding ? "Cancel" : "Record an application"}
            className="ml-auto rounded-lg bg-cyan-500/15 p-1 text-cyan-300 transition-colors hover:bg-cyan-500/25"
          >
            {adding ? <X size={14} /> : <Plus size={14} />}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {state.applications.length === 0 && !adding
            ? <EmptyApplications onStart={() => setAdding(true)} />
            : <ApplicationList
                applications={state.applications}
                selectedId={state.selected?.id ?? null}
                onSelect={state.select}
              />}
        </div>
      </section>

      {/* ── Right: the documents ────────────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/30">
        {adding ? (
          <NewApplicationForm
            busy={state.busy}
            onCancel={() => setAdding(false)}
            onCreate={async input => { await state.create(input); setAdding(false); }}
          />
        ) : state.selected ? (
          <ApplicationDetail
            // Keyed per application: selecting a different one resets which
            // document tab is open and any half-pressed delete confirmation,
            // rather than carrying them across to someone else's record.
            key={state.selected.id}
            application={state.selected}
            history={state.history}
            documents={docs.documents}
            versions={docs.versions}
            busy={state.busy || docs.busy}
            onSaveField={(field, value) => state.updateFields(state.selected!.id, { [field]: value })}
            onSetStatus={(status, note) => state.setStatus(state.selected!.id, status, note)}
            onOpenAttach={() => setAttachOpen(o => !o)}
            attachOpen={attachOpen}
            onDelete={() => state.remove(state.selected!.id)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="max-w-xs text-sm leading-relaxed text-slate-600">
              A private record of where you applied and what you actually sent —
              the posting, the cover letter, the résumé, and how far each one got.
              Nothing here is read by Hugh.
            </p>
          </div>
        )}
      </section>

      {/* ── Fourth pane: attachments, only when wanted ──────────────── */}
      {attachOpen && state.selected && !adding && (
        <AttachPane
          key={state.selected.id}
          application={state.selected}
          documents={docs.documents}
          versions={docs.versions}
          busy={state.busy || docs.busy}
          onClose={() => setAttachOpen(false)}
          onOpenLibrary={onOpenLibrary}
          onAttach={(kind, versionId) => state.attach(state.selected!.id, kind, versionId)}
          onCreateDocument={docs.createDocument}
        />
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-slate-100">{value}</div>
      <div className="truncate text-[10px] text-slate-600">{note}</div>
    </div>
  );
}

function EmptyApplications({ onStart }: { onStart: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-slate-400">Nothing recorded.</p>
      <p className="mx-auto mt-2 max-w-[200px] text-xs leading-relaxed text-slate-600">
        Add the first one and the chart, the counts and the history start from there.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-3 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
      >
        Record an application
      </button>
    </div>
  );
}

/**
 * Two required fields and a date, nothing more.
 *
 * The documents are added afterwards in the detail pane, on purpose: you record
 * an application the moment you send it, and a form demanding a pasted cover
 * letter up front is a form you skip when you are busy — which is exactly when
 * the record matters most.
 */
function NewApplicationForm({ busy, onCancel, onCreate }: {
  busy:     boolean;
  onCancel: () => void;
  onCreate: (input: {
    company: string; role_title: string; applied_on: string; job_url: string;
  }) => Promise<void>;
}) {
  const [company, setCompany] = useState("");
  const [role, setRole]       = useState("");
  const [when, setWhen]       = useState(() => new Date().toISOString().slice(0, 10));
  const [link, setLink]       = useState("");

  const ready = company.trim().length > 0 && role.trim().length > 0;

  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        if (!ready || busy) return;
        await onCreate({
          company: company.trim(), role_title: role.trim(),
          applied_on: when, job_url: link.trim(),
        });
      }}
      className="flex flex-1 flex-col p-4"
    >
      <h2 className="mb-1 text-sm font-semibold text-slate-200">Record an application</h2>
      <p className="mb-4 text-xs text-slate-600">
        The documents come next — you can paste them into the tabs once it&apos;s saved.
      </p>

      <label className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Company
      </label>
      <input
        value={company}
        onChange={e => setCompany(e.target.value)}
        placeholder="Halcyon Labs"
        maxLength={160}
        className="mb-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-600"
      />

      <label className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Role you applied for
      </label>
      <input
        value={role}
        onChange={e => setRole(e.target.value)}
        placeholder="Senior Analytics Engineer"
        maxLength={160}
        className="mb-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-600"
      />

      <label className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Sent on
      </label>
      <input
        type="date"
        value={when}
        max={new Date().toISOString().slice(0, 10)}
        onChange={e => setWhen(e.target.value)}
        className="mb-4 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-600 [color-scheme:dark]"
      />

      <label className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Link to the advert <span className="normal-case text-slate-700">· optional</span>
      </label>
      <input
        value={link}
        onChange={e => setLink(e.target.value)}
        placeholder="https://boards.example.com/jobs/123"
        inputMode="url"
        className="mb-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-600"
      />
      {/* Said plainly, because it changes what you do next: the link is a
          pointer and adverts come down. Pasting the description is what
          actually preserves the posting. */}
      <p className="mb-4 text-[10px] leading-relaxed text-slate-600">
        Listings get taken down when the role is filled — paste the description
        into the Job description tab too if you want to keep it.
      </p>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!ready || busy}
          className="rounded-lg bg-cyan-500/15 px-3 py-1.5 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** "24 Jun" for the stat note — compact, and the year is nearly always this one. */
function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}
