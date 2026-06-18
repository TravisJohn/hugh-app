'use client';

import { useState, useRef, useEffect } from 'react';

interface Props {
  initialTranscript: string;
  onChange:          (text: string) => void;
}

export default function TranscriptEditor({ initialTranscript, onChange }: Props) {
  const [text, setText]  = useState(initialTranscript);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);

  // Auto-resize up to max height so it never overflows the viewport
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 288)}px`;
  }, [text]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    onChange(e.target.value);
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
        Your Answer
      </p>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-5 py-4 leading-relaxed text-slate-200 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        style={{ minHeight: 120, maxHeight: 288 }}
        placeholder="Your spoken answer will appear here…"
      />
      <p className="text-xs text-slate-600">
        Correct any transcription errors before submitting.
      </p>
    </div>
  );
}
