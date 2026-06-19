"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  X, Plus, Loader2, MessageCircle, ArrowRight,
  Maximize2, Minimize2, ChevronDown, PenLine, BookOpen,
  OctagonAlert, CheckCircle2, ClipboardCheck,
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
  icon?:    React.ReactNode;
  open:     boolean;
  onToggle: () => void;
  count?:   number;
}

function SectionToggle({ label, icon, open, onToggle, count }: SectionProps) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 py-3 text-left"
    >
      <ChevronDown
        size={13}
        className={`shrink-0 text-slate-500 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
      />
      {icon && <span className="shrink-0 text-slate-500">{icon}</span>}
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
  const pathname = usePathname();

  const [entries, setEntries]               = useState<MilestoneEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [draft, setDraft]                   = useState("");
  const [draftTitle, setDraftTitle]         = useState("");
  const [saving, setSaving]                 = useState(false);
  const [expanded, setExpanded]             = useState(false);

  // Section visibility
  const [showOverview, setShowOverview]       = useState(true);
  const [showReview, setShowReview]           = useState(true);
  const [showActions, setShowActions]         = useState(true);
  const [showDiary, setShowDiary]             = useState(true);
  const [showWriteEntry, setShowWriteEntry]   = useState(true);

  // Which individual entries are expanded
  const [openEntries, setOpenEntries] = useState<Set<string>>(new Set());

  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const entriesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!milestone) {
      setExpanded(false);
      return;
    }
    const isReview = milestone.kanban_column === "review";
    setDraft("");
    setDraftTitle("");
    setEntries([]);
    setOpenEntries(new Set());
    setShowOverview(true);
    setShowReview(true);
    // Collapse support sections in review mode so learner focuses on the review
    setShowActions(!isReview);
    setShowDiary(!isReview);
    setShowWriteEntry(!isReview);
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
        body:    JSON.stringify({ body: draft.trim(), title: draftTitle.trim() || undefined }),
      });
      const d = await res.json();
      if (d.entry) {
        const newEntry = d.entry as MilestoneEntry;
        setEntries(prev => [...prev, newEntry]);
        setOpenEntries(prev => new Set([...prev, newEntry.id]));
        setDraft("");
        setDraftTitle("");
        setShowDiary(true);
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

  function quizHref(): string {
    if (!milestone) return "#";
    return `/review/${milestone.id}?returnUrl=${encodeURIComponent(pathname)}`;
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
        className={`fixed top-0 right-0 z-40 flex h-full flex-col border-l border-slate-700/80 shadow-2xl transition-all duration-300
          ${expanded ? "w-full bg-[#0A0F1E]" : "w-full max-w-md bg-slate-900"}
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Breathing orbs — only in expanded mode */}
        {expanded && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-breathe absolute top-0 left-0 h-[600px] w-[600px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-sky-500/20 blur-3xl" />
            <div className="animate-breathe-delayed absolute bottom-0 right-0 h-[700px] w-[700px] translate-x-1/3 translate-y-1/3 rounded-full bg-violet-500/15 blur-3xl" />
            <div className="animate-breathe-slow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-sky-400/10 blur-3xl" />
          </div>
        )}

        {milestone && (
          <div className="relative z-10 flex flex-1 min-h-0 flex-col">

            {/* Sticky header */}
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-700/60 px-6 py-5">
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

                {/* ── Overview ───────────────────────────────────────── */}
                <div className="border-b border-slate-700/40 px-6">
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

                {/* ── Review (only for review-column cards) ──────────── */}
                {milestone.kanban_column === "review" && (
                  <div className="border-b border-slate-700/40 px-6">
                    <SectionToggle
                      label="Review"
                      icon={
                        milestone.review_validated
                          ? <CheckCircle2 size={13} className="text-green-400" />
                          : <OctagonAlert size={13} className="text-red-400" />
                      }
                      open={showReview}
                      onToggle={() => setShowReview(v => !v)}
                    />
                    {showReview && (
                      <div className="pb-4 space-y-3">
                        {milestone.review_validated ? (
                          <div className="flex items-center gap-2.5 rounded-xl border border-green-500/30 bg-green-500/8 px-4 py-3">
                            <CheckCircle2 size={16} className="shrink-0 text-green-400" />
                            <div>
                              <p className="text-sm font-semibold text-green-300">Validated</p>
                              <p className="text-xs text-slate-500">This card has passed review.</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                              <OctagonAlert size={15} className="shrink-0 mt-0.5 text-red-400" />
                              <p className="text-sm text-slate-300 leading-relaxed">
                                This card is not yet validated. Pass a short quiz based on your learning diary to mark it as reviewed.
                              </p>
                            </div>

                            {loadingEntries ? (
                              <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
                                <Loader2 size={12} className="animate-spin" />
                                Checking learning activity…
                              </div>
                            ) : entries.length === 0 ? (
                              <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 px-4 py-3">
                                <p className="text-sm text-slate-400 leading-relaxed">
                                  Add at least one learning diary entry before starting the review quiz.
                                </p>
                              </div>
                            ) : (
                              <Link
                                href={quizHref()}
                                onClick={onClose}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700/70 border border-amber-600/40 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-700 transition-colors"
                              >
                                <ClipboardCheck size={14} />
                                Start Review Quiz
                                <span className="text-xs font-normal text-amber-300/70">({entries.length} {entries.length === 1 ? "entry" : "entries"})</span>
                              </Link>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Actions ────────────────────────────────────────── */}
                <div className="border-b border-slate-700/40 px-6">
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
                        className="glow-violet flex items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/8 px-4 py-3 transition-all hover:border-violet-500/60 hover:bg-violet-500/15 group"
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

                {/* ── Learning diary ─────────────────────────────────── */}
                <div className="px-6">
                  <SectionToggle
                    label="Learning diary"
                    icon={<BookOpen size={13} />}
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
                          No entries yet — log your first insight below.
                        </p>
                      )}

                      <div className="space-y-2 pb-4">
                        {entries.map(entry => {
                          const isOpen = openEntries.has(entry.id);
                          const label  = entry.title || entry.body.slice(0, 65) + (entry.body.length > 65 ? "…" : "");
                          return (
                            <div
                              key={entry.id}
                              className="rounded-lg border border-slate-700/50 bg-slate-800/50 overflow-hidden"
                            >
                              <button
                                onClick={() => toggleEntry(entry.id)}
                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-800/80 transition-colors"
                              >
                                <ChevronDown
                                  size={13}
                                  className={`shrink-0 text-slate-500 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
                                />
                                <span className="flex-1 min-w-0 truncate text-xs font-semibold text-violet-400">
                                  {label}
                                </span>
                                <span className="shrink-0 text-xs text-slate-600">
                                  {fmtCompact(entry.created_at)}
                                </span>
                              </button>

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

            {/* ── Log what I learned — collapsible, sticky at bottom ── */}
            <div className="shrink-0 border-t border-slate-700/60">
              <div className={expanded ? "max-w-3xl mx-auto" : ""}>
                <div className="px-6">
                  <SectionToggle
                    label="Log what I learned"
                    icon={<PenLine size={13} />}
                    open={showWriteEntry}
                    onToggle={() => setShowWriteEntry(v => !v)}
                  />
                </div>

                {showWriteEntry && (
                  <div className="px-6 pb-4">
                    <input
                      type="text"
                      value={draftTitle}
                      onChange={e => setDraftTitle(e.target.value)}
                      placeholder="Entry title (optional)"
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors mb-2"
                    />
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
                )}
              </div>
            </div>

          </div>
        )}
      </aside>
    </>
  );
}
