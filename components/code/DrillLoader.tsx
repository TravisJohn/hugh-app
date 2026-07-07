"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Wand2 } from "lucide-react";
import { SAMPLE_DRILL, type DrillContent } from "@/lib/code/drillContent";
import SwarmBackdrop from "./SwarmBackdrop";
import DrillMock from "./DrillMock";

// Owns the async step between "user picked a learning" and "drill is ready".
// With a topic it asks /api/code/generate-drill to build a drill for it (showing
// a build screen), then hands the content to DrillMock. Without a topic — or if
// generation fails — it falls back to the sample drill so the page always works.

export default function DrillLoader({ topic, context, focus }: { topic?: string; context?: string; focus?: string }) {
  const [content, setContent] = useState<DrillContent | null>(topic ? null : SAMPLE_DRILL);
  const [failed, setFailed]   = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!topic || started.current) return;
    started.current = true; // guard against React 18 double-invoke in dev

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/code/generate-drill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, context, focus }),
        });
        const data = (await res.json()) as { content?: DrillContent; generated?: boolean };
        if (cancelled) return;
        setContent(data.content ?? SAMPLE_DRILL);
        setFailed(!data.generated);
      } catch {
        if (cancelled) return;
        setContent(SAMPLE_DRILL);
        setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [topic, context, focus]);

  if (!content) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0A0F1E] text-slate-200">
        <SwarmBackdrop />
        <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
            <Wand2 size={22} />
          </span>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <Loader2 size={15} className="animate-spin" /> Hugh is building your drill…
          </div>
          {topic && (
            <p className="max-w-sm text-xs text-slate-500">
              Turning <span className="text-slate-300">{topic}</span> into short, typed-from-memory reps. Takes a few seconds.
            </p>
          )}
          <Link href="/code/start" className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400">
            <ArrowLeft size={12} /> Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {failed && topic && (
        <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-amber-500/30 bg-[#1a1206]/90 px-3 py-1.5 text-xs text-amber-300/90 shadow-lg backdrop-blur">
          Couldn&apos;t build a custom drill just now — here&apos;s a sample to practise on.
        </div>
      )}
      <DrillMock content={content} />
    </>
  );
}
