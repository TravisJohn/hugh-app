"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// The curves joining an opened group cell (the spine) to each of its packs.
//
// Geometry is MEASURED from the live DOM rather than computed from assumed card
// heights: leaf rows differ in height with the badges they carry, and the branch
// reflows between one and two columns. Measuring is the only way the curves stay
// attached when any of that changes.
//
// Two things make the measurement stable:
//
//   • It reads the leaves' STATIC WRAPPERS, not the animating cards. The cards
//     slide in on a transform, and getBoundingClientRect reports the transformed
//     box — so measuring the card mid-flight would anchor every curve to where
//     the leaf started rather than where it lands.
//
//   • It re-measures on a ResizeObserver over the container and again after web
//     fonts settle. Font swap changes text metrics, which changes card heights,
//     which moves every endpoint after first paint.
//
// The SVG sits behind the cards (first child of a relative container, so it
// paints underneath) and is pointer-events-none. In two-column layouts the
// curves to the far column pass behind the near cards, which reads like
// branches behind foliage rather than lines crossing content.

export interface BranchGeometry {
  /** Element the curves start from. */
  spine: HTMLElement | null;
  /** Static wrappers, one per leaf, in branch order. */
  leaves: (HTMLElement | null)[];
}

interface Curve {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Minimum horizontal reach of a control point, so short hops still curve. */
const MIN_REACH = 28;

export default function BranchLinks({
  containerRef,
  accent,
  staggerMs,
  /** Changing this forces a re-measure (group switch, language switch). */
  signature,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  accent: string;
  staggerMs: number;
  signature: string;
}) {
  const [curves, setCurves] = useState<Curve[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const spine = container.querySelector<HTMLElement>("[data-branch-spine]");
    const leaves = Array.from(container.querySelectorAll<HTMLElement>("[data-branch-leaf]"));
    if (!spine || leaves.length === 0) {
      setCurves([]);
      return;
    }

    const c = container.getBoundingClientRect();
    const s = spine.getBoundingClientRect();

    // Curves leave from the spine's right edge, vertically centred.
    const sx = s.right - c.left;
    const sy = s.top - c.top + s.height / 2;

    const next: Curve[] = leaves.map(leaf => {
      const r = leaf.getBoundingClientRect();
      const ex = r.left - c.left;
      const ey = r.top - c.top + r.height / 2;

      const reach = Math.max(MIN_REACH, (ex - sx) * 0.55);
      // Deliberately asymmetric control points — an even split gives a
      // mechanical, evenly-bowed S; a shorter first arm and longer second one
      // leaves the spine quickly and settles into the leaf, which reads organic.
      const c1x = sx + reach * 0.7;
      const c2x = ex - reach * 1.05;

      return {
        d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${sy.toFixed(1)}, ${c2x.toFixed(1)} ${ey.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`,
        x1: sx, y1: sy, x2: ex, y2: ey,
      };
    });

    setCurves(next);
    setBox({ w: c.width, h: c.height });
  }, [containerRef]);

  /** Coalesce bursts of layout events into one measure per frame. */
  const scheduleMeasure = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  // Before paint, so curves are never a frame behind the leaves they attach to.
  useLayoutEffect(() => {
    measure();
  }, [measure, signature]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(container);
    for (const el of container.querySelectorAll("[data-branch-leaf], [data-branch-spine]")) {
      ro.observe(el);
    }

    window.addEventListener("resize", scheduleMeasure);
    // Font swap resizes the cards after first paint; without this the curves
    // stay pinned to pre-swap positions until something else triggers a resize.
    document.fonts?.ready.then(scheduleMeasure).catch(() => {});

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, scheduleMeasure, signature]);

  if (curves.length === 0 || box.w === 0) return null;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      width={box.w}
      height={box.h}
    >
      <defs>
        {curves.map((c, i) => (
          // userSpaceOnUse + the curve's own endpoints makes the fade follow the
          // direction of travel, so every connector dims toward its own leaf
          // rather than toward a shared corner of the SVG.
          <linearGradient
            key={i}
            id={`branch-${signature}-${i}`}
            gradientUnits="userSpaceOnUse"
            x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
          >
            <stop offset="0%" stopColor={accent} stopOpacity="0.75" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.25" />
          </linearGradient>
        ))}
      </defs>

      {/* A bud where every curve leaves the spine, so they read as one branch
          rather than several unrelated lines meeting by coincidence. */}
      <circle cx={curves[0].x1} cy={curves[0].y1} r="2.5" fill={accent} opacity="0.5" />

      {curves.map((c, i) => (
        <path
          key={i}
          d={c.d}
          pathLength={1}
          fill="none"
          stroke={`url(#branch-${signature}-${i})`}
          strokeWidth={1.5}
          strokeLinecap="round"
          className="animate-branch-draw"
          style={{ animationDelay: `${i * staggerMs}ms` }}
        />
      ))}
    </svg>
  );
}
