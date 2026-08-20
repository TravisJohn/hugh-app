"use client";

import { STATUS_COLOR, STATUS_LABEL } from "@/lib/monitor/applications";
import type { ApplicationStatus } from "@/types/monitor";

// A status, wearing its validated colour. The bead carries the exact hex the
// chart stacks with, so a pill in the list and a segment in the chart are
// visibly the same thing — the label is not the only way to tell them apart,
// and the colour is not the only way either.

export default function StatusPill({ status, size = "sm" }: {
  status: ApplicationStatus;
  size?:  "sm" | "xs";
}) {
  const hex = STATUS_COLOR[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border ${
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
      style={{
        // Tinted from the status hex rather than a fixed slate, so the pill
        // reads as belonging to its status even at a glance.
        color:       hex,
        borderColor: `${hex}73`,
        background:  `${hex}21`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
      {STATUS_LABEL[status]}
    </span>
  );
}
