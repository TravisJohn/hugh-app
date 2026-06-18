'use client';

import { useRef, useEffect } from 'react';

interface Props {
  transcript: string;
}

export default function LiveTranscript({ transcript }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as transcript grows
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Recording badge */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
        <span className="text-xs font-medium uppercase tracking-wider text-red-400">
          Recording
        </span>
      </div>

      {/* Scrollable transcript — the one permitted internal scroll area */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-4"
      >
        {transcript ? (
          <p className="whitespace-pre-wrap leading-relaxed text-slate-200">
            {transcript}
          </p>
        ) : (
          <p className="italic text-slate-600">Listening…</p>
        )}
      </div>
    </div>
  );
}
