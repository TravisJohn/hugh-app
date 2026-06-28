"use client";

import { Tag } from "lucide-react";
import { type LearningPoint } from "@/types";

interface Props {
  points:     LearningPoint[];
  value:      string | null;
  onChange:   (id: string | null) => void;
  className?: string;
}

/**
 * Compact picker for tagging a diary entry / saved summary to one of the
 * milestone's "What to understand" learning points. Renders nothing when the
 * milestone has no checklist yet. Empty selection = untagged (general entry).
 */
export default function PointTagSelect({ points, value, onChange, className = "" }: Props) {
  if (points.length === 0) return null;
  return (
    <label className={`flex items-center gap-2 ${className}`}>
      <Tag size={12} className="shrink-0 text-slate-500" />
      <select
        value={value ?? ""}
        onChange={e => onChange(e.target.value || null)}
        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 transition-colors focus:border-violet-500 focus:outline-none"
      >
        <option value="">No learning point</option>
        {points.map(p => (
          <option key={p.id} value={p.id}>
            {p.text.length > 60 ? `${p.text.slice(0, 60)}…` : p.text}
          </option>
        ))}
      </select>
    </label>
  );
}
