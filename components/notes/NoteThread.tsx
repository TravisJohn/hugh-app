"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Sparkles, Loader2, Send, ScrollText, MessageSquare, RefreshCw } from "lucide-react";
import ChatBubble from "@/components/learn/ChatBubble";
import type { NoteMessage } from "@/types";

interface Props {
  hasImage:      boolean;
  imageTitle:    string | null;
  messages:      NoteMessage[];
  summary:       string | null;
  coaching:      boolean;
  summarizing:   boolean;
  loadingThread: boolean;
  onSaveThought: (content: string) => void;
  onCoach:       () => void;
  onSummarize:   () => void;
}

// Right ~1/3 pane: the selected screenshot's chat thread. The learner writes their
// thoughts ("Save thought" → a user turn) and, when ready, presses Coach → Hugh
// reads this one screenshot + its thread and appends a correction. The summary
// icon (top-right) swaps this whole pane for a running summary of the thread.
// The workspace keys this component by screenshot id, so switching screenshots
// remounts it — resetting the view back to the conversation and clearing the draft.
export default function NoteThread({
  hasImage, imageTitle, messages, summary,
  coaching, summarizing, loadingThread, onSaveThought, onCoach, onSummarize,
}: Props) {
  const [draft, setDraft] = useState("");
  const [view, setView]   = useState<"thread" | "summary">("thread");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the thread grows / Coach replies.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, coaching]);

  function save() {
    const v = draft.trim();
    if (!v) return;
    onSaveThought(v);
    setDraft("");
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter saves the thought; Shift+Enter for a newline.
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
  }

  const canCoach   = hasImage && !coaching;
  const canSummarize = messages.length > 0;

  // Open the summary view, generating it on first open (when none is cached yet).
  function openSummary() {
    setView("summary");
    if (!summary && !summarizing) onSummarize();
  }

  if (!hasImage) {
    return (
      <aside className="flex w-[34%] min-w-[320px] shrink-0 items-center justify-center border-l border-slate-800 bg-[#0B1120] px-6 text-center">
        <p className="text-sm text-slate-600">Select or add a screenshot to start a thread — your thoughts and Hugh&apos;s coaching for it appear here.</p>
      </aside>
    );
  }

  return (
    <aside className="flex w-[34%] min-w-[320px] shrink-0 flex-col border-l border-slate-800 bg-[#0B1120]">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-widest text-slate-500">
          {view === "summary" ? "Running summary" : `${imageTitle ?? "Your thinking"} · Hugh`}
        </span>
        {/* Summary toggle — top-right corner. Swaps the chat for a running summary. */}
        {view === "thread" ? (
          <button
            type="button"
            onClick={openSummary}
            disabled={!canSummarize}
            title={canSummarize ? "Summarise this conversation" : "Add a thought or coaching first"}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ScrollText size={14} /> Summary
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setView("thread")}
            title="Back to the conversation"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <MessageSquare size={14} /> Conversation
          </button>
        )}
      </header>

      {view === "summary" ? (
        // ── Running summary (replaces the chat) ──────────────────────────────
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {summarizing && !summary ? (
              <div className="flex items-center gap-2 pl-1 text-xs text-violet-400">
                <Loader2 size={14} className="animate-spin" /> Summarising this conversation…
              </div>
            ) : summary ? (
              <ChatBubble role="assistant" content={summary} />
            ) : (
              <div className="mt-6 text-center text-sm text-slate-600">
                <p className="mb-2">No summary yet.</p>
                <button
                  type="button"
                  onClick={onSummarize}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
                >
                  <ScrollText size={13} /> Generate summary
                </button>
              </div>
            )}
          </div>
          {summary && (
            <div className="shrink-0 border-t border-slate-800 p-3">
              <button
                type="button"
                onClick={onSummarize}
                disabled={summarizing}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
              >
                {summarizing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Regenerate
              </button>
            </div>
          )}
        </>
      ) : (
        // ── Conversation ─────────────────────────────────────────────────────
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {loadingThread ? (
              <p className="text-xs text-slate-600">Loading…</p>
            ) : messages.length === 0 ? (
              <div className="mt-6 text-center text-sm text-slate-600">
                <p className="mb-1">Jot down what you chose and <em>why</em>.</p>
                <p className="text-xs">Then hit <span className="text-violet-400">Coach</span> and Hugh will read the screenshot and check your reasoning.</p>
              </div>
            ) : (
              messages.map((m) => <ChatBubble key={m.id} role={m.role} content={m.content} />)
            )}

            {coaching && (
              <div className="flex items-center gap-2 pl-1 text-xs text-violet-400">
                <Loader2 size={14} className="animate-spin" /> Hugh is reading your screenshot…
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-slate-800 p-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              rows={3}
              placeholder="This is what I chose, and my reasoning was…"
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={!draft.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
              >
                <Send size={13} /> Save thought
              </button>
              <button
                type="button"
                onClick={onCoach}
                disabled={!canCoach}
                title={canCoach ? "" : "Add a screenshot or a thought first"}
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {coaching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Coach
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
