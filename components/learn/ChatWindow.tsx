"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import ChatBubble from "./ChatBubble";
import OffTrackNotice from "./OffTrackNotice";
import SummaryPanel, { type SummaryData } from "./SummaryPanel";

interface Message {
  role:    "user" | "assistant";
  content: string;
}

interface Props {
  topic:        string;
  goalId?:      string;
  milestoneId?: string;
}

const WELCOME = (topic: string) =>
  `Hi! I'm Hugh, and I'm here to help you learn about **${topic}**. Ask me anything — concepts, examples, how things work, or where to start.`;

export default function ChatWindow({ topic, goalId, milestoneId }: Props) {
  const [messages, setMessages]     = useState<Message[]>([
    { role: "assistant", content: WELCOME(topic) },
  ]);
  const [draft, setDraft]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [isOffTrack, setIsOffTrack] = useState(false);

  // Summary panel state
  const [panelOpen, setPanelOpen]   = useState(false);
  const [summary, setSummary]       = useState<SummaryData | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  async function send() {
    const text = draft.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setDraft("");
    setLoading(true);

    try {
      // Strip the synthetic welcome message before sending to the API.
      // It is plain-text (not JSON) and confuses Claude's format adherence on longer threads.
      const apiMessages = history
        .filter((_, i) => !(i === 0 && history[0].role === "assistant"))
        .map(m => ({ role: m.role, content: m.content }));
      const res  = await fetch("/api/learn/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ topic, messages: apiMessages }),
      });
      const data = await res.json() as { reply?: string; isOffTopic?: boolean; error?: string };

      setMessages(prev => [...prev, {
        role:    "assistant",
        content: data.reply ?? "Sorry, something went wrong. Please try again.",
      }]);
      setIsOffTrack(data.isOffTopic ?? false);
    } catch {
      setMessages(prev => [...prev, {
        role:    "assistant",
        content: "Network error — please try again.",
      }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  async function handleSummarise() {
    if (messages.length < 3 || summarizing) return;
    setPanelOpen(true);
    setSummarizing(true);
    setSummary(null);

    try {
      // Strip synthetic welcome before sending for summarisation
      const apiMessages = messages
        .filter((_, i) => !(i === 0 && messages[0].role === "assistant"))
        .map(m => ({ role: m.role, content: m.content }));
      const res  = await fetch("/api/learn/summarize", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ topic, messages: apiMessages }),
      });
      const data = await res.json() as SummaryData & { error?: string };
      if (data.error) throw new Error(data.error);
      setSummary(data);
    } catch {
      setSummary({ story: "Unable to generate summary. Please try again.", takeaway: "" });
    } finally {
      setSummarizing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Needs at least one real exchange (welcome + user msg + reply) to summarise
  const canSummarise = messages.length >= 3;

  return (
    <div className="flex flex-1 min-h-0">

      {/* ── Chat column ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">

        {/* Toolbar */}
        <div className="shrink-0 flex items-center justify-end border-b border-slate-800/50 px-4 py-2">
          <button
            onClick={handleSummarise}
            disabled={!canSummarise || summarizing}
            title={canSummarise ? "Summarise this session" : "Have a conversation first"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              panelOpen
                ? "bg-violet-600/20 text-violet-300"
                : canSummarise
                ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                : "cursor-not-allowed text-slate-600"
            }`}
          >
            <Sparkles size={13} />
            Summarise session
          </button>
        </div>

        {/* Off-track banner */}
        {isOffTrack && (
          <div className="shrink-0 px-4 pt-3">
            <OffTrackNotice topic={topic} onDismiss={() => setIsOffTrack(false)} />
          </div>
        )}

        {/* Message list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-4">
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role} content={m.content} />
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="mr-2.5 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-900/60 text-xs font-bold text-violet-400">
                H
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-3">
                <Loader2 size={14} className="animate-spin text-slate-500" />
                <span className="text-xs text-slate-500">Hugh is thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-slate-800 px-4 py-4">
          <div className="flex items-end gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 focus-within:border-violet-500 transition-colors">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask anything about ${topic}…`}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!draft.trim() || loading}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs text-slate-700">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* ── Summary side panel ──────────────────────────────────────── */}
      {panelOpen && (
        <SummaryPanel
          topic={topic}
          data={summary}
          loading={summarizing}
          goalId={goalId}
          milestoneId={milestoneId}
          onClose={() => { setPanelOpen(false); setSummary(null); }}
        />
      )}
    </div>
  );
}
