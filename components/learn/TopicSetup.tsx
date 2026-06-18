"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, ArrowRight } from "lucide-react";

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
  const [topic, setTopic] = useState("");
  const router            = useRouter();

  function handleStart() {
    const t = topic.trim();
    if (!t) return;
    router.push(`/learn?topic=${encodeURIComponent(t)}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleStart();
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
          onChange={e => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to learn? e.g. Apache Airflow"
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
          autoFocus
        />
        <button
          onClick={handleStart}
          disabled={!topic.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Start session
          <ArrowRight size={15} />
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
              onClick={() => setTopic(s)}
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
