"use client";

import HeatGauge from "./HeatGauge";
import { GROUP_ICONS } from "./groupIcons";
import type { CodeGroup } from "@/lib/code/groups";
import type { HeatReading } from "@/lib/code/heat";

// One territory on the /code/start map. Stacked in a grid; clicking one branches
// it open into its packs (wired up in PatternMap).
//
// Two colour systems meet here and are kept strictly apart:
//   • the group's ACCENT (icon, hover border, ambient glow) means identity —
//     which territory is this;
//   • the HEAT ramp inside HeatGauge means state — how much have I practised it.
// Accent is a raw hex from the taxonomy rather than a Tailwind class, so it
// arrives through a CSS custom property and inline styles; everything that
// isn't accent-derived stays in Tailwind like the rest of the page.

export default function GroupCell({
  group,
  packCount,
  heat,
  selected = false,
  dimmed = false,
  onSelect,
}: {
  group: CodeGroup;
  /** Packs in this group for the ACTIVE language — not group.packIds.length. */
  packCount: number;
  heat: HeatReading;
  selected?: boolean;
  /** Another cell is open: fade back and stop taking clicks or tab stops. */
  dimmed?: boolean;
  onSelect: (groupId: string) => void;
}) {
  const Icon = GROUP_ICONS[group.icon];
  const accent = group.accent;

  // Ambient glow tracks heat, so a well-practised territory quietly looks more
  // alive than an untouched one even before you read the gauge. Hex + alpha
  // suffix keeps this to one value from the taxonomy.
  const glowAlpha = { cold: "00", cool: "0f", warm: "1a", hot: "26", blazing: "33" }[heat.level];

  return (
    <button
      type="button"
      onClick={() => onSelect(group.id)}
      aria-pressed={selected}
      // `dimmed` is purely visual. Removing the cell from the tab order and the
      // a11y tree is the job of `inert` on the whole grid layer in PatternMap —
      // doing it per-cell here would leave the *selected* cell (which isn't
      // dimmed) still focusable inside a hidden layer.
      className={`group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
        selected
          ? "border-transparent bg-slate-900/80"
          : "border-slate-800 bg-slate-900/40 hover:-translate-y-0.5 hover:bg-slate-900/70"
      } ${dimmed ? "map-dimmed" : ""}`}
      style={{
        ...(selected ? { borderColor: accent } : {}),
        // `--accent` is read by the hover rule below via arbitrary-value syntax.
        ["--accent" as string]: accent,
      }}
    >
      {/* Ambient heat glow — sits behind the content, never intercepts clicks. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{ background: `radial-gradient(110% 70% at 50% 0%, ${accent}${glowAlpha}, transparent 70%)` }}
      />

      <span className="relative flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-white">{group.label}</span>
          <span className="block text-[11px] text-slate-500">
            {packCount} {packCount === 1 ? "pattern" : "patterns"}
          </span>
        </span>
      </span>

      <span className="relative mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-400">{group.tagline}</span>

      {/* mt-auto pins the gauge to the bottom of the cell, so gauges line up
          across a row instead of floating at whatever height the tagline ended. */}
      <span className="relative mt-auto flex items-center justify-between gap-2 pt-4">
        <HeatGauge heat={heat} showLabel />
        {/* Only in the grid. As the opened spine the cell is ~190px wide, and an
            invisible "Open →" still reserves width there — enough to wrap the
            gauge's label onto a second line. */}
        {!selected && (
          <span
            className="text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: accent }}
          >
            Open →
          </span>
        )}
      </span>

      {/* Hover border tint in the group's own colour. A pseudo-element ring
          avoids animating border-color, which would shift layout on some
          browsers at fractional widths. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl border border-transparent transition-colors group-hover:border-[color:var(--accent)]"
      />
    </button>
  );
}
