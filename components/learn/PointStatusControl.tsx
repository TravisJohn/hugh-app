"use client";

import { Check, Bookmark, HelpCircle, type LucideIcon } from "lucide-react";
import { type PointStatus } from "@/types";

interface StatusMeta {
  status: PointStatus;
  Icon:   LucideIcon;
  label:  string;
  active: string; // icon classes when this status is selected
}

// Single source of truth for the three statuses' icon + colour, reused by the
// rail, the drawer, and (for counts) the kanban card.
export const STATUS_META: Record<PointStatus, StatusMeta> = {
  understood: { status: "understood", Icon: Check,      label: "I understand this",  active: "text-green-400" },
  bookmarked: { status: "bookmarked", Icon: Bookmark,   label: "Bookmark for later", active: "text-amber-400" },
  stuck:      { status: "stuck",      Icon: HelpCircle, label: "Still don't get it", active: "text-red-400"   },
};

const ORDER: PointStatus[] = ["understood", "bookmarked", "stuck"];

interface Props {
  current:  PointStatus | undefined;
  onChange: (next: PointStatus | undefined) => void;
  size?:    number;
}

/**
 * Three mutually-exclusive self-assessment toggles. Picking a status sets it;
 * clicking the active one again clears it back to unstarted. Stops click
 * propagation so it can live inside clickable rows/cards.
 */
export default function PointStatusControl({ current, onChange, size = 15 }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {ORDER.map(key => {
        const { Icon, label, active } = STATUS_META[key];
        const isActive = current === key;
        return (
          <button
            key={key}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            onClick={e => { e.stopPropagation(); onChange(isActive ? undefined : key); }}
            className={`rounded p-0.5 transition-colors ${isActive ? active : "text-slate-600 hover:text-slate-300"}`}
          >
            <Icon size={size} strokeWidth={isActive ? 2.5 : 2} />
          </button>
        );
      })}
    </div>
  );
}
