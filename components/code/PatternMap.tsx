"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import BranchLinks from "./BranchLinks";
import GroupCell from "./GroupCell";
import LeafCard from "./LeafCard";
import { GROUP_ICONS } from "./groupIcons";
import { packIdsForLang, type CodeGroup } from "@/lib/code/groups";
import type { HeatReading } from "@/lib/code/heat";
import type { DrillPack } from "@/lib/code/packs";
import type { PackProgressSummary } from "@/lib/code/progress";
import type { DrillLang } from "@/types/code";

// The /code/start pattern map. Two states:
//
//   grid      — every territory as a stacked cell.
//   expanded  — one cell opened: the others blur back and away, the chosen one
//               becomes a spine, and its packs fan out beside it as leaves.
//
// Expanding is a MODE, not an accordion: the landing's hero, practice heatmap
// and Play section collapse away too (CodeLanding does that from `selectedId`)
// so the branch owns the viewport. With up to 8 leaves that's the only layout
// that honours the project's no-scroll rule.
//
// Both layers stay mounted through the transition and cross-fade. That's what
// makes the other cells visibly BLUR OUT rather than blink off — the grid layer
// goes absolute (so it stops taking up layout while the branch flows into
// place), its non-selected cells pick up `.map-dimmed`, and the whole layer
// fades. No FLIP measurement, no layout thrash, one CSS transition.
//
// State is CONTROLLED by CodeLanding rather than held here — the takeover means
// the parent has to know whether a group is open, and one owner beats two
// pieces of state kept in sync.
//
// Curves between spine and leaves are drawn by BranchLinks; each leaf is a
// LeafCard, which clamps its text to one row and reveals the rest on hover.

// Leaves are always ONE column. A two-column branch looked tidier on paper, but
// every curve to the far column has to cross the near column to get there —
// drawn behind semi-transparent cards, those lines read as streaks through the
// text. One column means every connector reaches its leaf without crossing
// anything, and the full-width cards truncate less. Eight leaves (the largest
// group) still fit the viewport, which is what made two columns unnecessary.

/** Milliseconds between each leaf appearing, in branch order. */
const STAGGER_MS = 40;

/** Cold fallback so a group with no attempts still renders a gauge. */
const NO_HEAT: HeatReading = { score: 0, level: "cold", attempts: 0, lastAttemptAt: null };

export default function PatternMap({
  groups,
  packs,
  lang,
  groupHeat,
  packHeat,
  progress,
  selectedId,
  onSelect,
}: {
  groups: CodeGroup[];
  packs: DrillPack[];
  lang: DrillLang;
  groupHeat?: Record<string, HeatReading>;
  /** Per-pack heat for the leaf gauges. */
  packHeat?: Record<string, HeatReading>;
  progress?: Record<string, PackProgressSummary>;
  /** Open group, or null for the grid. */
  selectedId: string | null;
  onSelect: (groupId: string | null) => void;
}) {
  const selected = groups.find(g => g.id === selectedId) ?? null;

  // A language with only one territory (SQL today) has nothing to choose
  // between, so it opens straight into the branch and offers no way back to a
  // one-cell grid.
  const singleGroup = groups.length === 1;
  const expanded = Boolean(selected);

  const branchRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** The spine + leaves box the connector curves are measured against. */
  const branchBoxRef = useRef<HTMLDivElement>(null);
  /** Which cell was last opened, so focus can return to it on close. */
  const lastOpened = useRef<string | null>(null);
  const wasExpanded = useRef(false);

  // Escape closes the branch — the same affordance as the Back control, for
  // anyone who opened it from the keyboard.
  useEffect(() => {
    if (!expanded || singleGroup) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSelect(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, singleGroup, onSelect]);

  // Follow focus across the transition: into the branch on open, back onto the
  // cell that was opened on close. Without this, closing strands focus on a
  // button that no longer exists and the tab order restarts from the top.
  useEffect(() => {
    if (expanded) {
      branchRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    } else if (wasExpanded.current && lastOpened.current) {
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-group-id="${lastOpened.current}"] button`)
        ?.focus();
    }
    wasExpanded.current = expanded;
  }, [expanded]);

  const leafPacks = selected
    ? packIdsForLang(selected, lang)
        .map(id => packs.find(p => p.id === id))
        .filter((p): p is DrillPack => Boolean(p))
    : [];

  const Icon = selected ? GROUP_ICONS[selected.icon] : null;

  return (
    <div className="relative">
      {/* ── Grid layer ──────────────────────────────────────────────────── */}
      {/* `inert` rather than aria-hidden: the grid keeps its cells mounted while
          it fades, and aria-hidden over a subtree that still holds focusable
          buttons is a violation — a keyboard user tabs into something screen
          readers have been told isn't there. inert removes the layer from the
          tab order, the accessibility tree and hit-testing at once, which is
          exactly what "this layer is behind now" should mean. */}
      <div
        ref={gridRef}
        inert={expanded}
        className={`grid gap-3 transition-all duration-300 sm:grid-cols-2 lg:grid-cols-3 ${
          expanded ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "opacity-100"
        }`}
      >
        {groups.map(group => (
          // `h-full` on both wrapper and cell: this wrapper is the grid item, so
          // IT stretches to the row height, but the button inside it doesn't
          // follow unless told to — which left cells with a one-line tagline
          // visibly shorter than their neighbours. Card size carries no meaning
          // (heat is the gauge and the glow), so uneven heights just read as a
          // bug.
          <div key={group.id} data-group-id={group.id} className="h-full">
            <GroupCell
              group={group}
              packCount={packIdsForLang(group, lang).length}
              heat={groupHeat?.[group.id] ?? NO_HEAT}
              dimmed={expanded && group.id !== selectedId}
              onSelect={id => {
                lastOpened.current = id;
                onSelect(id);
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Branch layer ────────────────────────────────────────────────── */}
      {selected && Icon && (
        <div>
          {!singleGroup && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              <ArrowLeft size={14} /> All areas
            </button>
          )}

          {/* `relative` makes this the reference box BranchLinks measures
              against, and the SVG being the first child keeps the curves behind
              the cards. */}
          {/* The gap is load-bearing, not cosmetic: the connectors are drawn
              into it, and at a normal card gap they have no room to curve and
              collapse into 20px hooks. */}
          <div ref={branchBoxRef} className="relative flex items-start gap-14">
            <BranchLinks
              containerRef={branchBoxRef}
              accent={selected.accent}
              staggerMs={STAGGER_MS}
              signature={`${selected.id}-${lang}-${leafPacks.length}`}
            />

            {/* The opened cell, narrowed to a spine the leaves hang off. */}
            <div data-branch-spine className="w-[190px] shrink-0">
              <GroupCell
                group={selected}
                packCount={leafPacks.length}
                heat={groupHeat?.[selected.id] ?? NO_HEAT}
                selected
                onSelect={() => { if (!singleGroup) onSelect(null); }}
              />
            </div>

            <div ref={branchRef} className="grid min-w-0 flex-1 gap-2">
              {leafPacks.map((pack, i) => (
                <LeafCard
                  key={pack.id}
                  pack={pack}
                  index={i}
                  total={leafPacks.length}
                  icon={Icon}
                  accent={selected.accent}
                  heat={packHeat?.[pack.id]}
                  progress={progress?.[pack.id]}
                  staggerMs={STAGGER_MS}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
