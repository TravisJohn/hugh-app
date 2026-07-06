"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X, Send, Loader2 } from "lucide-react";

interface Msg { role: "user" | "assistant"; content: string }

const WELCOME: Msg = {
  role: "assistant",
  content: "Hey, I'm Hugh 👋 Stuck on a step, or want a quick Python tip? Ask away.",
};

/**
 * Floating coding helper for the Code practice page. A Hugh-icon bubble bottom-
 * right toggles a compact chat backed by the Haiku route (/api/code/chat). Kept
 * self-contained so it can drop onto any Code screen.
 */
export default function CodeChat() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [draft, setDraft]       = useState("");
  const [loading, setLoading]   = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, open]);

  async function send() {
    const text = draft.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setLoading(true);
    try {
      const res = await fetch("/api/code/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Drop the synthetic welcome so the transcript starts with a user turn.
        body: JSON.stringify({ messages: next.slice(1) }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", content: data.reply ?? data.error ?? "Sorry — please try again." }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <>
      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[60] flex h-[460px] w-[92vw] max-w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1424] shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Image src="/hugh-icon.png" alt="Hugh" width={22} height={22} className="rounded-full" />
              <span className="text-sm font-semibold text-slate-100">Hugh</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">coding helper</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-200">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start gap-2"}`}>
                {m.role === "assistant" && (
                  <Image src="/hugh-icon.png" alt="" width={22} height={22} className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full" />
                )}
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-sm bg-sky-600 text-white"
                    : "rounded-tl-sm border border-slate-700 bg-slate-800/70 text-slate-200"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 size={13} className="animate-spin" /> Hugh is thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="shrink-0 border-t border-slate-800 p-2.5">
            <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 focus-within:border-sky-500">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="Ask about the code…"
                className="max-h-24 flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
              <button
                onClick={send}
                disabled={!draft.trim() || loading}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Hugh bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open Hugh coding helper"
        className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 bg-[#0d1424] shadow-xl transition-transform hover:scale-105"
      >
        {open ? (
          <X size={22} className="text-slate-300" />
        ) : (
          <Image src="/hugh-icon.png" alt="Hugh" width={40} height={40} className="rounded-full" />
        )}
      </button>
    </>
  );
}
