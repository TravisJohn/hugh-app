"use client";

import { useEffect, useRef, useState } from "react";
import {
  X, BookOpen, Plus, Loader2, MessageCircle, ArrowRight,
  Maximize2, Minimize2, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { type Milestone, type MilestoneEntry, KANBAN_COLUMN_LABELS } from "@/types";

interface Props {
  milestone:     Milestone | null;
  topicContext?: string;
  goalId?:       string;
  onClose:       () => void;
}

const COLUMN_COLOURS: Record<string, string> = {
  backlog: "text-slate-400 bg-slate-800",
  learn:   "text-sky-400 bg-sky-900/40",
  review:  "text-amber-400 bg-amber-900/40",
  done:    "text-green-400 bg-green-900/40",
};

function fmtCompact(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

interface SectionProps {
  label:    string;
  open:     boolean;
  onToggle: () => void;
  count?:   number;
}

function SectionToggle({ label, open, onToggle, count }: SectionProps) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 py-3 text-left"
    >
      <ChevronDown
        size={13}
        className={`shrink-0 text-slate-500 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
      />
      <span className="flex-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      {count !== undefined && (
        <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-600">
          {count}
        </span>
      )}
    </button>
  );
}

export default function MilestoneDrawer({ milestone, topicContext, goalId, onClose }: Props) {
  const [entries, setEntries]               = useState<MilestoneEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [draft, setDraft]                   = useState("");
  const [saving, setSaving]                 = useState(false);
  const [expanded, setExpanded]             = useState(false);

  // Section visibility — all open by default
  const [showOverview, setShowOverview] = useState(true);
  const [showActions, setShowActions]   = useState(true);
  const [showDiary, setShowDiary]       = useState(true);

  // Which individual entries are expanded
  const [openEntries, setOpenEntries] = useState<Set<string>>(new Set());

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const entriesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!milestone) {
      setExpanded(false);
      return;
    }
    setDraft("");
    setEntries([]);
    setOpenEntries(new Set());
    setShowOverview(true);
    setShowActions(true);
    setShowDiary(true);
    setLoadingEntries(true);
    fetch(`/api/tracker/milestones/${milestone.id}/entries`)
      .then(r => r.json())
      .then(d => setEntries(d.entries ?? []))
      .finally(() => setLoadingEntries(false));
  }, [milestone?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    entriesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  function toggleEntry(id: string) {
    setOpenEntries(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submitEntry() {
    if (!draft.trim() || !milestone || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tracker/milestones/${milestone.id}/entries`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ body: draft.trim() }),
      });
      const d = await res.json();
      if (d.entry) {
        const newEntry = d.entry as MilestoneEntry;
        setEntries(prev => [...prev, newEntry]);
        setOpenEntries(prev => new Set([...prev, newEntry.id])); // auto-expand new entry
        setDraft("");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitEntry();
    }
  }

  function askHref(): string {
    if (!milestone) return "#";
    const titleParam = encodeURIComponent(milestone.title);
    if (goalId) {
      return `/study/${goalId}/ask?milestoneId=${milestone.id}&milestone=${titleParam}`;
    }
    const topicParam = topicContext
      ? encodeURIComponent(`${topicContext}: ${milestone.title}`)
      : titleParam;
    return `/learn?topic=${topicParam}`;
  }

  const open = milestone !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-40 flex h-full flex-col bg-slate-900 border-l border-slate-700 shadow-2xl transition-all duration-300
          ${expanded ? "w-full" : "w-full max-w-md"}
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {milestone && (
          <>
            {/* Sticky header — never scrolls */}
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-700 px-6 py-5">
              <div className="flex-1 min-w-0">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold mb-2 ${COLUMN_COLOURS[milestone.kanban_column]}`}>
                  {KANBAN_COLUMN_LABELS[milestone.kanban_column]}
                </span>
                <h2 className="text-base font-semibold text-slate-100 leading-snug">
                  {milestone.title}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                  title={expanded ? "Collapse to sidebar" : "Expand to full screen"}
                >
                  {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className={expanded ? "max-w-3xl mx-auto" : ""}>

                {/* ── Overview ─────────────────────────────────────── */}
                <div className="border-b border-slate-700/60 px-6">
                  <SectionToggle
                    label="Overview"
                    open={showOverview}
                    onToggle={() => setShowOverview(v => !v)}
                  />
                  {showOverview && (
                    <p className="pb-4 text-sm text-slate-300 leading-relaxed">
                      {milestone.summary}
                    </p>
                  )}
                </div>

                {/* ── Actions ──────────────────────────────────────── */}
                <div className="border-b border-slate-700/60 px-6">
                  <SectionToggle
                    label="Actions"
                    open={showActions}
                    onToggle={() => setShowActions(v => !v)}
                  />
                  {showActions && (
                    <div className="pb-4">
                      <Link
                        href={askHref()}
                        onClick={onClose}
                        className="flex items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/8 px-4 py-3 transition-all hover:border-violet-500/50 hover:bg-violet-500/12 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                            <MessageCircle size={15} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-violet-300">Ask Hugh about this</p>
                            <p className="text-xs text-slate-500">Full chat — summarise, deep-dive, examples</p>
                          </div>
                        </div>
                        <ArrowRight size={15} className="shrink-0 text-violet-500 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  )}
                </div>

                {/* ── Learning diary ───────────────────────────────── */}
                <div className="px-6">
                  <SectionToggle
                    label="Learning diary"
                    open={showDiary}
                    onToggle={() => setShowDiary(v => !v)}
                    count={entries.length || undefined}
                  />

                  {showDiary && (
                    <>
                      {loadingEntries && (
                        <div className="flex justify-center py-6">
                          <Loader2 size={18} className="animate-spin text-slate-500" />
                        </div>
                      )}
                      {!loadingEntries && entries.length === 0 && (
                        <p className="py-6 text-center text-xs text-slate-600">
                          No entries yet — add your first thought below.
                        </p>
                      )}

                      <div className="space-y-2 pb-4">
                        {entries.map(entry => {
                          const isOpen = openEntries.has(entry.id);
                          return (
                            <div
                              key={entry.id}
                              className="rounded-lg border border-slate-700/50 bg-slate-800/50 overflow-hidden"
                            >
                              {/* Entry header — always visible */}
                              <button
                                onClick={() => toggleEntry(entry.id)}
                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors"
                              >
                                <ChevronDown
                                  size={13}
                                  className={`shrink-0 text-slate-500 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
                                />
                                <span className="flex-1 min-w-0 truncate text-xs font-semibold text-violet-400">
                                  {entry.title || "Note"}
                                </span>
                                <span className="shrink-0 text-xs text-slate-600">
                                  {fmtCompact(entry.created_at)}
                                </span>
                              </button>

                              {/* Entry body — visible when expanded */}
                              {isOpen && (
                                <div className="border-t border-slate-700/40 px-3 py-3 pl-8">
                                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                                    {entry.body}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div ref={entriesEndRef} />
                      </div>
                    </>
                  )}
                </div>

              </div>
            </div>

            {/* Sticky write-entry area — never scrolls */}
            <div className="shrink-0 border-t border-slate-700 px-6 py-4">
              <div className={expanded ? "max-w-3xl mx-auto" : ""}>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write a thought, insight, or note…"
                  rows={3}
                  className="w-full resize-none rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-600">⌘ Enter to save</span>
                  <button
                    onClick={submitEntry}
                    disabled={!draft.trim() || saving}
                    className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Add entry
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
