"use client";

import { STATUS_STACK, STATUS_COLOR, STATUS_LABEL, type ChartColumn } from "@/lib/monitor/applications";

// Applications sent per day, stacked by where each one stands now.
//
// The bar's position is the day it was sent; its colour is today's outcome. The
// chart is therefore not a record of the past but the past re-coloured by what
// became of it — which is the only version that answers "did that good week
// lead anywhere".
//
// Segments render in STATUS_STACK order, bottom first, and that order is a
// colour-blindness constraint rather than a preference — see
// lib/monitor/applications.ts. Do not reorder to taste.

const H = 130, PAD_L = 22, PAD_B = 18, PAD_T = 8;

export default function ApplicationChart({ columns }: { columns: ChartColumn[] }) {
  const maxTotal = Math.max(1, ...columns.map(c => c.total));
  const plotH    = H - PAD_B - PAD_T;

  // Gridlines every other application, at most five, so a tall day doesn't
  // produce a ruled page.
  const step = Math.max(1, Math.ceil(maxTotal / 4));
  const lines: number[] = [];
  for (let g = 0; g <= maxTotal; g += step) lines.push(g);

  const barW = (100 - 6) / Math.max(1, columns.length);

  return (
    <div>
      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        className="h-[130px] w-full"
        role="img"
        aria-label={`Applications sent per day over the last ${columns.length} days, stacked by current status`}
      >
        {lines.map(g => {
          const y = H - PAD_B - (g / maxTotal) * plotH;
          return (
            <g key={g}>
              {/* Recessive: reference, not furniture. */}
              <line x1={PAD_L / 5} x2={100} y1={y} y2={y} stroke="#1B2740" strokeWidth={0.4} />
              <text
                x={PAD_L / 5 - 1} y={y + 2.5} textAnchor="end"
                fill="#5B6B85" fontSize={6} style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {g}
              </text>
            </g>
          );
        })}

        {columns.map((col, i) => {
          let y = H - PAD_B;
          const x = PAD_L / 5 + i * barW;
          return (
            <g key={col.date}>
              <title>{describeColumn(col)}</title>
              {col.segments.map((n, si) => {
                if (!n) return null;
                const h = (n / maxTotal) * plotH;
                y -= h;
                return (
                  <rect
                    key={STATUS_STACK[si]}
                    x={x}
                    y={y}
                    width={Math.max(0.4, barW - 0.35)}
                    // A 0.3 gap keeps two segments from reading as one taller
                    // block of the upper colour.
                    height={Math.max(0.4, h - 0.3)}
                    fill={STATUS_COLOR[STATUS_STACK[si]]}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Legend runs top-of-stack first, matching how the eye reads a bar
            downward from the best outcome. */}
        {[...STATUS_STACK].reverse().map(s => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The hover text: a day with nothing sent should say so, not show an empty tooltip. */
function describeColumn(col: ChartColumn): string {
  if (col.total === 0) return `${col.date}: nothing sent`;
  const parts = col.segments
    .map((n, i) => n > 0 ? `${n} ${STATUS_LABEL[STATUS_STACK[i]].toLowerCase()}` : null)
    .filter((p): p is string => p !== null)
    .reverse();
  return `${col.date}: ${col.total} sent — ${parts.join(", ")}`;
}
