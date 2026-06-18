"use client";

import { AlertTriangle, X } from "lucide-react";

interface Props {
  topic:     string;
  onDismiss: () => void;
}

export default function OffTrackNotice({ topic, onDismiss }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-700/60 bg-amber-900/30 px-4 py-3 text-sm">
      <AlertTriangle size={15} className="shrink-0 text-amber-400" />
      <p className="flex-1 text-amber-300">
        You&apos;re drifting off topic.{" "}
        <span className="font-semibold">Hugh is focused on {topic}.</span>
      </p>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 text-amber-500 hover:text-amber-300 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
