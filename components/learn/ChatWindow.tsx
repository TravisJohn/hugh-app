"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Sparkles, Code2 } from "lucide-react";
import ChatBubble from "./ChatBubble";
import OffTrackNotice from "./OffTrackNotice";
import SummaryPanel, { type SummaryData } from "./SummaryPanel";
import PomodoroControl from "./PomodoroControl";
import { usePomodoroContext } from "./PomodoroProvider";
import CodeComposer from "@/components/askcode/CodeComposer";
import { isCodeModeRequest, isCodeModeCommand } from "@/lib/askcode/detect";
import { fenceCode, mergeCodeExample } from "@/lib/askcode/format";
import type { ChatResponse } from "@/types/askcode";

interface Message {
  role:    "user" | "assistant";
  content: string;
}

interface Props {
  topic:               string;
  goalId?:             string;
  milestoneId?:        string;
  milestoneTitle?:     string;
  onTranscriptChange?: (text: string) => void;
  onSummariseStart?:   () => void;
}

// Wrap-up nudge tuning. The nudge appears when Hugh judges the card covered, or
// after a run of off-topic turns (drift), or as a soft backstop on a long
// session — then stays quiet for a cooldown if the learner keeps chatting.
type OfferReason = "covered" | "drift" | "length";
const DRIFT_STREAK   = 2;   // consecutive off-topic turns before the drift nudge
const LENGTH_CAP     = 10;  // user messages before the soft "long session" backstop
const OFFER_COOLDOWN = 4;   // user messages to stay quiet after a "keep chatting"

const WELCOME = (topic: string) =>
  `Hi! I'm Hugh, and I'm here to help you learn about **${topic}**. Ask me anything — concepts, examples, how things work, or where to start.`;

export default function ChatWindow({ topic, goalId, milestoneId, milestoneTitle, onTranscriptChange, onSummariseStart }: Props) {
  const [messages, setMessages]     = useState<Message[]>([
    { role: "assistant", content: WELCOME(topic) },
  ]);
  const [draft, setDraft]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [isOffTrack, setIsOffTrack] = useState(false);

  // ── Code mode ──────────────────────────────────────────────────────
  // `offer` holds the language of Hugh's latest snippet while it's waiting to be
  // mirrored (drives the "Mirror this snippet" button — offer-first, never an
  // automatic flip). `codeMode` swaps the composer for the CodeMirror editor.
  const [offer, setOffer]         = useState<string | null>(null);
  const [codeMode, setCodeMode]   = useState(false);
  const [codeLang, setCodeLang]   = useState("python");
  const [codeDraft, setCodeDraft] = useState("");
  // Authoring (learner typed "code mode" to write their own) vs mirroring (Hugh
  // offered a snippet to retype). Drives the editor's placeholder + language toggle.
  const [codeAuthoring, setCodeAuthoring] = useState(false);

  // Wrap-up nudge: replaces the old fixed "after 3 messages" offer. `offerReason`
  // holds why it's currently showing (null = hidden); once the learner saves we
  // stop offering; a "keep chatting" dismissal sets a cooldown so it isn't naggy.
  const [offerReason,       setOfferReason]       = useState<OfferReason | null>(null);
  const [offerSaved,        setOfferSaved]        = useState(false);
  const [offTopicStreak,    setOffTopicStreak]    = useState(0);
  const [offerCooldownUntil, setOfferCooldownUntil] = useState(0);

  // Summary panel state
  const [panelOpen, setPanelOpen]     = useState(false);
  const [summary, setSummary]         = useState<SummaryData | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // Shared app-wide Pomodoro focus timer. While a focus block is active, the chat
  // route is asked to use the 1-hour prompt-cache TTL (spaced study keeps the
  // prefix warm). Reading the context (not a fresh hook) keeps this in sync with
  // the global dock shown on other pages.
  const pomo = usePomodoroContext();

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, offerReason]);

  // Surface the running transcript (minus the synthetic welcome) to the parent,
  // so the checklist side-rail can fold the chat into its coverage assessment.
  useEffect(() => {
    if (!onTranscriptChange) return;
    const text = messages
      .filter((_, i) => !(i === 0 && messages[0].role === "assistant"))
      .map(m => `${m.role === "user" ? "Learner" : "Hugh"}: ${m.content}`)
      .join("\n\n");
    onTranscriptChange(text);
  }, [messages, onTranscriptChange]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  // Shared send path for both plain-text turns and mirrored-code turns. The code
  // turn is just an ordinary user message whose content happens to be a fenced
  // block — it lives in the thread like any other turn, nothing special persists.
  async function postMessage(userContent: string, codeModeRequested: boolean) {
    if (loading) return;

    const history = [...messages, { role: "user" as const, content: userContent }];
    setMessages(history);
    setLoading(true);

    try {
      // Strip the synthetic welcome message before sending to the API.
      const apiMessages = history
        .filter((_, i) => !(i === 0 && history[0].role === "assistant"))
        .map(m => ({ role: m.role, content: m.content }));
      const res  = await fetch("/api/learn/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ topic, messages: apiMessages, focusMode: pomo.focusActive, codeModeRequested }),
      });
      const data = await res.json() as Partial<ChatResponse> & { error?: string };

      // Fold any code example into the stored message so it renders (via the
      // bubble's markdown) and stays in history for Hugh to compare against.
      const replyText = mergeCodeExample(
        data.reply ?? "Sorry, something went wrong. Please try again.",
        data.codeExample ?? null,
      );
      const updated = [...history, { role: "assistant" as const, content: replyText }];
      setMessages(updated);

      const offTopic = data.isOffTopic ?? false;
      setIsOffTrack(offTopic);

      // Snippet attached → offer the mirror step (offer-first, not auto-switch).
      if (data.codeExample) {
        setOffer(data.codeExample.language || "python");
      }

      // Track consecutive off-topic turns so drift can trigger the wrap-up nudge.
      const streak = offTopic ? offTopicStreak + 1 : 0;
      setOffTopicStreak(streak);

      // Decide whether to surface the wrap-up nudge, and why. Priority: Hugh's
      // "covered" judgement (resolution) > repeated drift > long-session backstop.
      // Suppressed once saved, while already showing, or during the cooldown.
      const userCount = updated.filter(m => m.role === "user").length;
      if (!offerSaved && !offerReason && userCount >= offerCooldownUntil) {
        const reason: OfferReason | null =
          data.covered            ? "covered"
          : streak >= DRIFT_STREAK  ? "drift"
          : userCount >= LENGTH_CAP ? "length"
          : null;
        if (reason) setOfferReason(reason);
      }
    } catch {
      setMessages(prev => [...prev, {
        role:    "assistant",
        content: "Network error — please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function sendText() {
    const text = draft.trim();
    if (!text || loading) return;

    // A bare "code mode" command opens the editor for the learner to write their
    // own snippet — it's a UI command, not a question, so it never hits the API.
    if (isCodeModeCommand(text)) {
      setDraft("");
      openCodeAuthoring();
      return;
    }

    setDraft("");
    // For other messages the keyword only gates the request; Hugh decides if code
    // actually helps (and may still proactively offer a snippet to mirror).
    void postMessage(text, isCodeModeRequest(text)).then(() => textareaRef.current?.focus());
  }

  function sendCode() {
    const code = codeDraft.trim();
    if (!code || loading) return;
    const content = fenceCode(codeLang, code);
    setCodeMode(false);
    setCodeDraft("");
    setOffer(null);
    void postMessage(content, false);
  }

  // Mirror path: retype the snippet Hugh just offered (language is dictated by it).
  function enterCodeMode() {
    setCodeAuthoring(false);
    setCodeLang(offer ?? "python");
    setCodeMode(true);
  }

  // Authoring path: the learner typed "code mode" to write their own code. Start
  // from a blank editor; language defaults to Python but is theirs to switch.
  function openCodeAuthoring() {
    setOffer(null);
    setCodeAuthoring(true);
    setCodeLang("python");
    setCodeDraft("");
    setCodeMode(true);
  }

  async function handleSummarise() {
    if (messages.length < 3 || summarizing) return;
    onSummariseStart?.();
    setPanelOpen(true);
    setSummarizing(true);
    setSummary(null);

    try {
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
      sendText();
    }
  }

  // Wrap-up nudge actions. Saving summarises + captures to a card and retires the
  // nudge for the session; dismissing hides it and stays quiet for a cooldown.
  function acceptOffer() {
    setOfferSaved(true);
    setOfferReason(null);
    handleSummarise();
  }
  function dismissOffer() {
    const userCount = messages.filter(m => m.role === "user").length;
    setOfferReason(null);
    setOfferCooldownUntil(userCount + OFFER_COOLDOWN);
  }

  const canSummarise = messages.length >= 3;

  return (
    <div className="flex flex-1 min-h-0 min-w-0">

      {/* ── Chat column ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">

        {/* Toolbar */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-800/50 px-4 py-2">
          <PomodoroControl pomo={pomo} />
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

          {/* Wrap-up nudge — content-aware: fires on coverage, drift, or a long
              session, with wording + save label matched to the reason. */}
          {offerReason && !offerSaved && (() => {
            const focus = milestoneTitle ?? "this topic";
            const copy = {
              covered: {
                body: <>You&apos;ve worked through the key ideas for <span className="font-semibold text-violet-200">{focus}</span>. Want me to summarise this chat and save the insights to your tracker card?</>,
                save: "Save to tracker →",
              },
              drift: {
                body: <>We&apos;ve drifted a little from <span className="font-semibold text-violet-200">{focus}</span>. Want me to capture what&apos;s useful and save it so you can refocus — or keep exploring?</>,
                save: "Save & wrap up →",
              },
              length: {
                body: <>We&apos;ve covered a lot of ground here. Want me to summarise and save the key insights to your tracker card before we go further?</>,
                save: "Save to tracker →",
              },
            }[offerReason];
            return (
              <div className="flex gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-900/60 text-xs font-bold text-violet-400">
                  H
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-violet-500/30 bg-violet-900/15 px-4 py-3.5 space-y-3 max-w-[85%]">
                  <p className="text-sm text-slate-200 leading-relaxed">{copy.body}</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={acceptOffer}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
                    >
                      {copy.save}
                    </button>
                    <button
                      onClick={dismissOffer}
                      className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
                    >
                      Keep chatting
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          <div ref={bottomRef} />
        </div>

        {/* Composer — CodeMirror editor in code mode, otherwise the text input */}
        {codeMode ? (
          <CodeComposer
            language={codeLang}
            value={codeDraft}
            disabled={loading}
            placeholder={codeAuthoring
              ? "Write your code here — Hugh will take a look…"
              : undefined}
            onLanguageChange={codeAuthoring ? setCodeLang : undefined}
            onChange={setCodeDraft}
            onSend={sendCode}
            onExit={() => setCodeMode(false)}
          />
        ) : (
          <div className="shrink-0 border-t border-slate-800 px-4 py-4">

            {/* Mirror-this offer — appears after Hugh shares a snippet (offer-first) */}
            {offer && (
              <button
                type="button"
                onClick={enterCodeMode}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/15 transition-colors"
              >
                <Code2 size={14} />
                Mirror this snippet — retype it with your own comments
              </button>
            )}

            <div className="flex items-end gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 focus-within:border-violet-500 transition-colors">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything… (type “code mode” to write code)"
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
              <button
                onClick={sendText}
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
        )}
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
