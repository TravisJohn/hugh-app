"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { classifyTopic, type TopicDomainVerdict } from "@/lib/learn/topic-domain";

const SUGGESTIONS = [
  "Apache Airflow",
  "dbt (data build tool)",
  "Apache Kafka",
  "Apache Spark",
  "Snowflake",
  "Kubernetes",
  "Advanced SQL",
  "MLOps fundamentals",
];

export default function TopicSetup() {
  const [topic, setTopic]       = useState("");
  const [checking, setChecking] = useState(false);
  const [gate, setGate]         = useState<TopicDomainVerdict | null>(null);
  const router                  = useRouter();

  async function handleStart() {
    const t = topic.trim();
    if (!t || checking) return;
    setChecking(true);
    setGate(null);

    // Strict domain gate — only data & analytics topics start a session.
    const verdict = await classifyTopic(t);
    setChecking(false);
    if (!verdict.inDomain) {
      setGate(verdict);
      return;
    }

    router.push(`/learn?topic=${encodeURIComponent(t)}`);
  }

  function handleTopicChange(value: string) {
    setTopic(value);
    if (gate) setGate(null); // editing the topic clears the reminder
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void handleStart();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      {/* Icon + headline */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-900/40 text-violet-400">
          <Lightbulb className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Focused Learning
          </h1>
          <p className="mt-2 max-w-sm text-sm text-slate-400 leading-relaxed">
            Pick a topic and Hugh becomes your dedicated tutor. Ask anything
            about it — Hugh will nudge you back if you drift off track.
          </p>
        </div>
      </div>

      {/* Input */}
      <div className="w-full max-w-md space-y-3">
        <input
          type="text"
          value={topic}
          onChange={e => handleTopicChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to learn? e.g. Apache Airflow"
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
          autoFocus
        />

        {/* Out-of-domain reminder (strict data & analytics gate) */}
        {gate && !gate.inDomain && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
              <div className="space-y-2.5">
                <p className="text-sm leading-relaxed text-slate-200">
                  {gate.message ||
                    "Hugh is built specifically for data & analytics learning — that topic sits outside this focus. Try a data-related angle."}
                </p>
                {gate.suggestions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Try a data angle</p>
                    <div className="flex flex-wrap gap-2">
                      {gate.suggestions.map(s => (
                        <button
                          key={s}
                          onClick={() => handleTopicChange(s)}
                          className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/20 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!topic.trim() || checking}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {checking ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Checking topic…
            </>
          ) : (
            <>
              Start session
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </div>

      {/* Suggestions */}
      <div className="w-full max-w-md">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-600">
          Popular topics
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => handleTopicChange(s)}
              className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:border-violet-500 hover:text-slate-200 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
