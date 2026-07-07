"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Wand2 } from "lucide-react";
import { SAMPLE_DRILL, type DrillContent } from "@/lib/code/drillContent";
import { getPack } from "@/lib/code/packs";
import SwarmBackdrop from "./SwarmBackdrop";
import DrillMock from "./DrillMock";

// Picks the drill content and renders DrillMock.
// - `pack`: a curated practice pack — static, instant, no LLM (the main path).
// - `topic`: legacy AI-generated drill via /api/code/generate-drill (build screen
//   + sample fallback); kept working but no longer linked from the landing.
// - neither: the sample drill.

export default function DrillLoader({ pack, topic, context, focus }: { pack?: string; topic?: string; context?: string; focus?: string }) {
  const packContent = pack ? getPack(pack)?.content : undefined;
  const initial = packContent ?? (topic ? null : SAMPLE_DRILL);

  const [content, setContent] = useState<DrillContent | null>(initial);
  const [failed, setFailed]   = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!topic || packContent || started.current) return;
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
  }, [topic, context, focus, packContent]);

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
