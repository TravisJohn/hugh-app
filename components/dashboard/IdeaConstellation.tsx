"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IDEA_GROUPS,
  CORE_LABEL,
  buildConstellation,
  project,
  depthOpacity,
  groupOpacity,
  regionCentre,
  orbitPosition,
  orbitTilt,
  type GroupProgress,
} from "@/lib/learn/constellation";
import { type InFlightGoal } from "@/lib/learn/progress";

interface Props {
  /**
   * False while the pane is faded out. The animation loop stops rather than
   * spinning a sphere nobody can see — this sits on the landing screen of the
   * app, next to the input someone is trying to type in.
   */
  active: boolean;
  /**
   * How much of each region the learner has mastered, 0..1. An absent key reads
   * as untouched, so `{}` is a perfectly good new learner.
   *
   * `null` means the read FAILED, which is a different thing and must not be
   * drawn as an empty brain — telling someone they have achieved nothing
   * because a query dropped is exactly what rule 5 exists to prevent. The
   * sphere then makes no claim either way: every region burns the same.
   */
  progress?: GroupProgress | null;
  /**
   * What the learner is working through right now. Each one orbits its own
   * cluster, brightly and regardless of how lit that region is: this is the
   * only thing on the sphere that is about today rather than about history.
   */
  inFlight?: readonly InFlightGoal[];
}

// Frame budget. 30fps is indistinguishable for a slow drift and halves the work
// of a loop that touches a few hundred SVG attributes each pass.
const FRAME_MS = 1000 / 30;

/** Radians per second of idle rotation. Slow enough to notice only if you look. */
const IDLE_SPIN = 0.06;

/** How far the pointer can tilt the sphere, in radians. */
const TILT = 0.5;

/**
 * Brightness used when progress could not be read. Deliberately mid-range: it
 * looks like a sphere, not like an achievement, so it neither claims the
 * learner has done everything nor accuses them of having done nothing.
 */
const UNKNOWN_PROGRESS_OPACITY = 0.5;

/** Radians per second an in-flight goal travels round its cluster. */
const ORBIT_SPEED = 1.4;

/**
 * The tail behind a mote.
 *
 * Drawn from the orbit path itself — segment k is simply where the mote WAS k
 * steps ago — rather than from a buffer of remembered positions. That matters
 * because the whole sphere is turning underneath: a remembered screen position
 * would smear across the view, while a remembered angle is recomputed in the
 * current rotation every frame and stays welded to the path.
 */
const TRAIL_SEGMENTS = 10;
const TRAIL_STEP     = 0.055;

/**
 * How many samples draw the shell itself.
 *
 * The whole ring is drawn, faintly, because the path is most of what makes this
 * read as an orbit at all — a lone dot moving is ambiguous, a dot moving along a
 * visible circuit is not. Recomputed every frame rather than drawn once: the
 * sphere turns underneath, so the ring has to turn with it.
 */
const RING_SAMPLES = 56;

/** How far a region that is NOT the focused one is pushed back. */
const MUTED = 0.16;

/** How many names are surfacing at once, and how long each one lives. */
const WHISPER_SLOTS = 3;
const WHISPER_LIFE_MS = 7800;
const WHISPER_FADE_MS = 1100;

// The idle half of /home/learn: a sphere of concept nodes with Data at the
// core, clustered by the learner's interest areas.
//
// SVG and arithmetic, not WebGL — no library, no model file, nothing added to
// the bundle. The projection and the lighting curve live in
// lib/learn/constellation.ts where they are unit-tested; this file owns only
// the loop and the paint.
//
// Attributes are written straight to the DOM rather than through state. A
// re-render of five hundred elements thirty times a second would make the text
// field beside it feel heavy, which is the one thing an idle decoration must
// never do. The only React state here is which names are currently surfacing,
// which changes every couple of seconds, not every frame.
export default function IdeaConstellation({ active, progress, inFlight = [] }: Props) {
  const { points, edges } = useMemo(() => buildConstellation(), []);
  const colorOf = useMemo(() => new Map(IDEA_GROUPS.map(g => [g.id, g.color])), []);
  const indexOf = useMemo(() => new Map(points.map((p, i) => [p.id, i])), [points]);
  const named   = useMemo(
    () => points.map((p, i) => (p.label ? i : -1)).filter(i => i >= 0),
    [points],
  );

  // A region the learner has picked out of the legend. Everything else recedes
  // while it is set, which is the only way to read one cluster out of a field
  // of several hundred points. Null is the normal state, not an empty one.
  const [focused, setFocused] = useState<string | null>(null);

  // Brightness per point, fixed for a given progress record and focus.
  // Precomputed because it cannot change between frames and the loop is hot.
  const litOf = useMemo(
    () => points.map(p => {
      const base = progress ? groupOpacity(progress, p.group) : UNKNOWN_PROGRESS_OPACITY;
      if (!focused) return base;
      // A focused region is brought fully forward regardless of how much of it
      // has been mastered: picking it out is a question about where things ARE,
      // not about what has been earned.
      return p.group === focused ? Math.max(base, 0.95) : base * MUTED;
    }),
    [points, progress, focused],
  );

  const paneRef  = useRef<HTMLDivElement>(null);
  const dotRefs  = useRef<(SVGCircleElement | null)[]>([]);
  const lineRefs = useRef<(SVGLineElement | null)[]>([]);
  const wRefs    = useRef<(SVGTextElement | null)[]>([]);
  const orbDot   = useRef<(SVGCircleElement | null)[]>([]);
  const orbRing  = useRef<(SVGCircleElement | null)[]>([]);
  // Flat, indexed goal * TRAIL_SEGMENTS + segment.
  const orbTrail = useRef<(SVGLineElement | null)[]>([]);
  const orbPath  = useRef<(SVGPolylineElement | null)[]>([]);

  const tilt = useRef({ x: 0, y: 0 });

  // Which point each whisper slot is currently speaking, and when it started.
  // A thought arrives, is legible for a moment, and goes.
  //
  // No React state and no timer: the loop already runs, already knows the time,
  // and already writes to these elements. Rotating a name is one more thing it
  // does on the frame the old one expires — which also means the rotation can
  // never tear down and restart the animation, and the label can never be a
  // frame out of step with the point it is attached to.
  const slots  = useRef<{ point: number; born: number }[]>([]);
  const cursor = useRef(0);

  const spinRef = useRef(0.6);

  useEffect(() => {
    if (!active) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const rotY = spinRef.current + tilt.current.x * TILT;
      const rotX = tilt.current.y * TILT;

      const projected = points.map(p => project(p, rotY, rotX));

      for (let i = 0; i < points.length; i++) {
        const dot = dotRefs.current[i];
        const q   = projected[i]!;
        if (!dot) continue;
        dot.setAttribute("cx", (q.x * 80).toFixed(2));
        dot.setAttribute("cy", (q.y * 80).toFixed(2));
        dot.setAttribute("r", (0.4 + q.scale * 0.55).toFixed(2));
        dot.setAttribute("opacity", (depthOpacity(q.z) * litOf[i]!).toFixed(3));
      }

      for (let i = 0; i < edges.length; i++) {
        const line = lineRefs.current[i];
        if (!line) continue;
        const ai = indexOf.get(edges[i]!.from) ?? 0;
        const a  = projected[ai]!;
        const b  = projected[indexOf.get(edges[i]!.to) ?? 0]!;
        line.setAttribute("x1", (a.x * 80).toFixed(2));
        line.setAttribute("y1", (a.y * 80).toFixed(2));
        line.setAttribute("x2", (b.x * 80).toFixed(2));
        line.setAttribute("y2", (b.y * 80).toFixed(2));
        line.setAttribute(
          "opacity",
          (depthOpacity((a.z + b.z) / 2) * litOf[ai]! * 0.3).toFixed(3),
        );
      }

      // Names ride their own point, so a whisper is always attached to
      // something rather than floating over the middle of the sphere.
      for (let i = 0; i < WHISPER_SLOTS; i++) {
        const text = wRefs.current[i];
        if (!text || named.length === 0) continue;

        let slot = slots.current[i];
        // Expired, or never filled. New slots are staggered by their index so
        // the three do not arrive and leave in lockstep.
        if (!slot || now - slot.born > WHISPER_LIFE_MS) {
          const point = named[cursor.current % named.length]!;
          cursor.current += 1;
          const stagger = slot ? 0 : (WHISPER_LIFE_MS / WHISPER_SLOTS) * i;
          slot = { point, born: now - stagger };
          slots.current[i] = slot;
          text.textContent = points[point]!.label ?? "";
        }

        const q = projected[slot.point]!;
        text.setAttribute("x", (q.x * 80 + 3).toFixed(2));
        text.setAttribute("y", (q.y * 80 + 1).toFixed(2));

        const age  = now - slot.born;
        const rise = Math.min(1, age / WHISPER_FADE_MS);
        const fall = Math.min(1, Math.max(0, (WHISPER_LIFE_MS - age) / WHISPER_FADE_MS));
        // Exactly the opacity of the point it is attached to, times its own
        // arrival and departure. A name is not a caption on the sphere; it is
        // the same object, briefly saying what it is — so in an unlit region it
        // is barely there, which is the point.
        const own = depthOpacity(q.z) * litOf[slot.point]!;
        text.setAttribute("opacity", (rise * fall * own).toFixed(3));
      }

      // In-flight work: a bright mote going round its own cluster. Drawn last
      // so it is never buried inside the field it belongs to.
      for (let i = 0; i < inFlight.length; i++) {
        const dot  = orbDot.current[i];
        const ring = orbRing.current[i];
        const centre = regionCentre(inFlight[i]!.region);
        if (!centre || !dot) continue;

        const tilt = orbitTilt(i);

        // The shell itself, faint and closed.
        const path = orbPath.current[i];
        if (path) {
          let d = "";
          for (let k = 0; k <= RING_SAMPLES; k++) {
            const r = project(
              orbitPosition(centre, (k / RING_SAMPLES) * Math.PI * 2, tilt),
              rotY, rotX,
            );
            d += `${(r.x * 80).toFixed(1)},${(r.y * 80).toFixed(1)} `;
          }
          path.setAttribute("points", d.trim());
        }

        // Offset per goal so several in one region are spread around the
        // circuit rather than sitting on top of one another.
        const angle = (now / 1000) * ORBIT_SPEED
          + (i * Math.PI * 2) / Math.max(1, inFlight.length);
        const q = project(orbitPosition(centre, angle, tilt), rotY, rotX);

        const cx = (q.x * 80).toFixed(2);
        const cy = (q.y * 80).toFixed(2);
        // Depth only, never region progress: this is what they are doing now,
        // and a dark region is exactly where it most needs to be visible.
        //
        // Its own floor, well above the field's. A point at the back of the
        // sphere is allowed to almost disappear; a goal the learner is actually
        // working on is not, whichever way round it happens to be facing.
        const alpha = (0.42 + Math.min(1, Math.max(0, (q.z + 1) / 2)) * 0.45)
          * (!focused || inFlight[i]!.region === focused ? 1 : MUTED);

        // Bigger than a field point but not loud. The shell does the work of
        // saying "this is different"; the mote only has to be followable.
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", cy);
        dot.setAttribute("r", (1 + q.scale * 0.95).toFixed(2));
        dot.setAttribute("opacity", alpha.toFixed(3));

        if (ring) {
          ring.setAttribute("cx", cx);
          ring.setAttribute("cy", cy);
          ring.setAttribute("r", (2.2 + q.scale * 1.9).toFixed(2));
          ring.setAttribute("opacity", (alpha * 0.28).toFixed(3));
        }

        // The tail. Each segment is a step further back along the path, and a
        // step fainter, so it thins out to nothing behind the mote.
        let prev = q;
        for (let k = 0; k < TRAIL_SEGMENTS; k++) {
          const line = orbTrail.current[i * TRAIL_SEGMENTS + k];
          if (!line) continue;
          const back = project(
            orbitPosition(centre, angle - (k + 1) * TRAIL_STEP, tilt),
            rotY, rotX,
          );
          line.setAttribute("x1", (prev.x * 80).toFixed(2));
          line.setAttribute("y1", (prev.y * 80).toFixed(2));
          line.setAttribute("x2", (back.x * 80).toFixed(2));
          line.setAttribute("y2", (back.y * 80).toFixed(2));
          line.setAttribute(
            "opacity",
            ((0.35 + Math.min(1, Math.max(0, (back.z + 1) / 2)) * 0.4)
              * (1 - k / TRAIL_SEGMENTS) * 0.7).toFixed(3),
          );
          prev = back;
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      if (dt < FRAME_MS) return;
      last = now;
      if (!reduced) spinRef.current += (dt / 1000) * IDLE_SPIN;
      draw(now);
    };

    draw(performance.now());
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, points, edges, indexOf, litOf, named, colorOf, inFlight, focused]);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const box = paneRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;
    tilt.current = {
      x: (e.clientX - box.left) / box.width  - 0.5,
      y: (e.clientY - box.top)  / box.height - 0.5,
    };
  }

  return (
    <div
      ref={paneRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => { tilt.current = { x: 0, y: 0 }; }}
      className="relative h-full w-full"
    >
      <svg
        viewBox="-100 -100 200 200"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="core-glow">
            <stop offset="0%"   stopColor="#38bdf8" stopOpacity="0.5" />
            <stop offset="45%"  stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* The core, behind everything, and always lit: whatever the learner
            has or has not done, this is still what the app is about. */}
        <circle cx="0" cy="0" r="44" fill="url(#core-glow)" />
        <circle cx="0" cy="0" r="3.5" fill="#7dd3fc" opacity="0.9" />
        <text
          x="0" y="14"
          textAnchor="middle"
          className="fill-sky-200/80 text-[6px] font-semibold uppercase"
          style={{ letterSpacing: "0.3em" }}
        >
          {CORE_LABEL}
        </text>

        <g>
          {edges.map((e, i) => (
            <line
              key={`${e.from}-${e.to}-${i}`}
              ref={el => { lineRefs.current[i] = el; }}
              stroke={colorOf.get(points[indexOf.get(e.from) ?? 0]!.group)}
              strokeWidth={0.22}
              opacity={0}
            />
          ))}
        </g>

        <g>
          {points.map((p, i) => (
            <circle
              key={p.id}
              ref={el => { dotRefs.current[i] = el; }}
              fill={colorOf.get(p.group)}
              r={0.8}
              opacity={0}
            />
          ))}
        </g>

        {/* Empty on purpose: the loop fills in each name, its colour and its
            position together, so a label can never be shown against the wrong
            point for a frame. */}
        <g>
          {Array.from({ length: WHISPER_SLOTS }, (_, i) => (
            <text
              key={i}
              ref={el => { wRefs.current[i] = el; }}
              className="text-[4px] font-light"
              fill="#e2e8f0"
              style={{ letterSpacing: "0.06em" }}
              opacity={0}
            />
          ))}
        </g>
        {/* In-flight work. One mote per goal, circling the cluster it was filed
            under — the only thing on the sphere that is about today.
            Unlabelled on purpose: the sphere is a picture of shape and effort,
            and a caption on every one of them turns it back into a list. */}
        <g>
          {inFlight.map((g, i) => {
            const colour = colorOf.get(g.region) ?? "#e2e8f0";
            return (
              <g key={g.id}>
                <polyline
                  ref={el => { orbPath.current[i] = el; }}
                  fill="none"
                  stroke={colour}
                  strokeWidth={0.22}
                  opacity={0.16}
                />
                {Array.from({ length: TRAIL_SEGMENTS }, (_, k) => (
                  <line
                    key={k}
                    ref={el => { orbTrail.current[i * TRAIL_SEGMENTS + k] = el; }}
                    stroke={colour}
                    strokeWidth={0.55}
                    strokeLinecap="round"
                    opacity={0}
                  />
                ))}
                <circle
                  ref={el => { orbRing.current[i] = el; }}
                  fill="none"
                  stroke={colour}
                  strokeWidth={0.3}
                  opacity={0}
                />
                <circle
                  ref={el => { orbDot.current[i] = el; }}
                  fill={colour}
                  opacity={0}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* The only place the interest areas are spelled out. Each swatch carries
          its own brightness, so the legend is the same achievement record as
          the sphere rather than a static key beside it. */}
      <div className="absolute right-0 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
        {IDEA_GROUPS.map(g => {
          const isFocused = focused === g.id;
          const lit = progress ? groupOpacity(progress, g.id) : UNKNOWN_PROGRESS_OPACITY;
          return (
            <button
              key={g.id}
              type="button"
              // Clicking the region already shown clears it, so there is always
              // a way back to the whole map without hunting for one.
              onClick={() => setFocused(prev => (prev === g.id ? null : g.id))}
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-left text-[10px] transition-colors ${
                isFocused
                  ? "bg-slate-800/70 text-slate-200"
                  : focused
                  ? "text-slate-600 hover:text-slate-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full transition-opacity"
                style={{
                  background: g.color,
                  opacity: isFocused ? 1 : focused ? lit * 0.4 : lit,
                }}
              />
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
