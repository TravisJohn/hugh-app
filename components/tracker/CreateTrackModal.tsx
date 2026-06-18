"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles, Loader2 } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function CreateTrackModal({ onClose }: Props) {
  const [topic, setTopic]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const router                  = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleGenerate() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tracker/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const data = await res.json() as { trackId?: string; error?: string };

      if (!res.ok || !data.trackId) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }

      router.push(`/tracker/${data.trackId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleGenerate();
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">New learning track</h2>
            <p className="mt-1 text-sm text-slate-400">
              Describe what you want to learn — Claude will map out the full milestone curriculum.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Apache Airflow, System Design, dbt…"
          disabled={loading}
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 disabled:opacity-50 transition-colors"
        />

        {error && (
          <p className="mt-2 text-xs text-red-400">{error}</p>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!topic.trim() || loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Hugh is mapping your learning path…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Generate curriculum
            </>
          )}
        </button>

        {loading && (
          <p className="mt-3 text-center text-xs text-slate-600">
            This takes 5–10 seconds — don&apos;t close the tab.
          </p>
        )}
      </div>
    </div>
  );
}
