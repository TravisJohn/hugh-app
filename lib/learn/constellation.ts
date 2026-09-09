// ── The idea constellation ───────────────────────────────────────────────────
//
// The right half of /home/learn when the learner has not started: a sphere of
// concept nodes with DATA at its core, clustered into the disciplines that feed
// it. It answers "what is this app actually about?" in one glance, without
// asking anyone to read a list.
//
// The shape carries the argument. Data sits at the centre because every cluster
// around it is a way of getting at the same thing — the maths that justifies a
// claim, the engineering that moves it, the automation that keeps it running,
// the telling that lands it. A list would have implied a ranking; a sphere does
// not.
//
// It is also meant to be READ as a brain. A region starts nearly dark and
// brightens as the learner masters milestones in it, so the picture doubles as
// a record of what they have actually built — not a score, and not a
// leaderboard, just the shape of their own attention over time. That is why
// `groupOpacity` bottoms out well above zero rather than at nothing: a new
// learner should see unlit potential, not a broken graphic.
//
// Nothing is permanently labelled. Names surface a few at a time and fade — a
// field of four hundred captions is a wall of text nobody reads, and the
// whisper is closer to how a thought actually arrives.
//
// Everything here is pure and deterministic — no Math.random, so the server and
// the browser draw the same sphere, and the layout can be unit-tested at all.

import { LEARNING_REGIONS, CORE_LABEL } from "@/lib/learn/regions";

export { CORE_LABEL };

/**
 * The clusters, as this drawing sees them.
 *
 * A thin re-shaping of `LEARNING_REGIONS` so the renderer keeps one vocabulary
 * ("groups" of "labels") while the product taxonomy lives in one place that the
 * gate and progress also read.
 */
export interface IdeaGroup {
  id:     string;
  label:  string;
  color:  string;
  labels: readonly string[];
}

export const IDEA_GROUPS: readonly IdeaGroup[] = LEARNING_REGIONS.map(r => ({
  id: r.id, label: r.label, color: r.color, labels: r.concepts,
}));

export interface IdeaPoint {
  id:     string;
  group:  string;
  /** Position within the unit sphere, each -1..1. */
  x:      number;
  y:      number;
  z:      number;
  /** Distance from the core, 0..1. Labelled nodes sit further out, where there is room. */
  radius: number;
  /** Present on a small minority of points. */
  label?: string;
}

export interface IdeaEdge {
  from: string;
  to:   string;
}

/** How many points the field holds. Dense enough to read as tissue rather than a diagram. */
export const POINT_COUNT = 760;

/**
 * A small deterministic generator.
 *
 * Not for cryptography and not for statistics — only to scatter points so the
 * sphere looks grown rather than plotted. Deterministic because the same markup
 * has to come out of the server and the browser, and because a layout that
 * changes on every render cannot be tested.
 */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Evenly spread directions on a sphere — the golden-angle spiral. */
function fibonacciDirections(n: number): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = golden * i;
    out.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r });
  }
  return out;
}

export interface Vec3 { x: number; y: number; z: number }

/**
 * The direction each region's cluster sits in, in list order.
 *
 * Shared by the field (which assigns each point to its nearest centre) and by
 * the orbits (which circle one). If these two ever disagreed, a learner's
 * current work would orbit a cluster it does not belong to.
 */
export function regionCentres(): Vec3[] {
  return fibonacciDirections(IDEA_GROUPS.length);
}

/** The centre of one region, by id. Null for a region this drawing does not know. */
export function regionCentre(regionId: string): Vec3 | null {
  const i = IDEA_GROUPS.findIndex(g => g.id === regionId);
  return i < 0 ? null : regionCentres()[i]!;
}

/**
 * How far out an orbital shell sits — just beyond the field, so the ring reads
 * as a path around the whole sphere rather than a line through it.
 */
export const ORBIT_RADIUS = 1.22;

/**
 * Where a piece of in-flight work sits at a given moment.
 *
 * A GREAT CIRCLE around the core, not a small ring around its cluster. The
 * distinction took two attempts to get right, so it is worth stating: a little
 * circle drawn near a cluster reads as one more point in the field, because
 * nothing about it says "this is going round something". A shell that sweeps
 * the entire sphere is unmistakable — it is the shape everyone already reads as
 * an electron round a nucleus, and the nucleus here is Data, which is the claim
 * the whole picture is making anyway.
 *
 * The region still matters. Each orbit's plane is chosen to CONTAIN its
 * cluster's direction, so the mote passes directly over its own cluster once
 * per lap and the association survives the bigger shape.
 *
 * `tilt` spins that plane about the cluster direction, so two goals in one
 * region trace different shells that cross, rather than sharing one ring.
 */
export function orbitPosition(centre: Vec3, angle: number, tilt = 0): Vec3 {
  const c = normalise(centre);

  // Any vector not parallel to the centre gives a starting perpendicular. The
  // fallback matters: a cluster sitting exactly on the Y axis would otherwise
  // produce a zero-length cross product and collapse the orbit to a point.
  const seed = Math.abs(c.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u0 = normalise(cross(c, seed));
  const v0 = normalise(cross(c, u0));

  // The plane's second axis, rotated about c by `tilt`. Still perpendicular to
  // c, so the plane always contains the cluster direction.
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const u  = { x: u0.x * ct + v0.x * st, y: u0.y * ct + v0.y * st, z: u0.z * ct + v0.z * st };

  const ca = Math.cos(angle), sa = Math.sin(angle);
  return {
    x: (c.x * ca + u.x * sa) * ORBIT_RADIUS,
    y: (c.y * ca + u.y * sa) * ORBIT_RADIUS,
    z: (c.z * ca + u.z * sa) * ORBIT_RADIUS,
  };
}

/**
 * The plane each successive orbit is rotated into.
 *
 * Spread rather than shared, so two goals in the same region trace crossing
 * shells instead of chasing each other round one ring — which is the difference
 * between an atom and a racetrack.
 */
export function orbitTilt(index: number): number {
  return (index % 5) * 0.72;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalise(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Build the field: points spread over a sphere, each belonging to the cluster
 * whose centre it lies nearest, so the groups come out as contiguous regions
 * rather than interleaved confetti.
 */
export function buildConstellation(): { points: IdeaPoint[]; edges: IdeaEdge[] } {
  const rand    = mulberry(20260909);
  const centres = regionCentres();
  const dirs    = fibonacciDirections(POINT_COUNT);

  const points: IdeaPoint[] = dirs.map((d, i) => {
    let best = 0;
    let bestDot = -Infinity;
    centres.forEach((c, gi) => {
      const dot = c.x * d.x + c.y * d.y + c.z * d.z;
      if (dot > bestDot) { bestDot = dot; best = gi; }
    });

    // A shell with thickness, not a wireframe ball.
    const radius = 0.42 + rand() * 0.58;
    return {
      id:     "p" + i,
      group:  IDEA_GROUPS[best]!.id,
      x:      d.x * radius,
      y:      d.y * radius,
      z:      d.z * radius,
      radius,
    };
  });

  // Hand out the names. Each cluster gives its labels to its outermost points,
  // which is where there is room for text without it landing on the core.
  for (const group of IDEA_GROUPS) {
    const mine = points
      .filter(p => p.group === group.id)
      .sort((a, b) => b.radius - a.radius);
    group.labels.forEach((label, i) => {
      const target = mine[i * 2];
      if (target) target.label = label;
    });
  }

  // Edges only ever join points of the same group, so the lines reinforce the
  // clusters instead of webbing the whole sphere into one grey mass. Every
  // third point gets one; all of them would be a net, not a constellation.
  const edges: IdeaEdge[] = [];
  for (const group of IDEA_GROUPS) {
    const mine = points.filter(p => p.group === group.id);
    for (let i = 0; i < mine.length; i += 3) {
      const a = mine[i]!;
      let near: IdeaPoint | null = null;
      let nearD = Infinity;
      for (let j = 0; j < mine.length; j++) {
        if (i === j) continue;
        const b = mine[j]!;
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
        if (d < nearD) { nearD = d; near = b; }
      }
      if (near) edges.push({ from: a.id, to: near.id });
    }
  }

  return { points, edges };
}

export interface Projected {
  x:     number;
  y:     number;
  /** Perspective scale. Above 1 is nearer the viewer, below 1 further away. */
  scale: number;
  /** Rotated depth, -1..1. Positive is nearer. */
  z:     number;
}

/** How strongly the sphere reads as deep. Larger is flatter. */
export const PERSPECTIVE = 3;

/**
 * Rotate a point about Y then X, and project it onto the plane.
 *
 * Returned x/y are still in unit-sphere space, so the caller multiplies by
 * whatever radius its pane gives it. Kept out of the component precisely so the
 * rotation can be tested without a DOM.
 */
export function project(
  p:    { x: number; y: number; z: number },
  rotY: number,
  rotX: number,
): Projected {
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const x1 =  p.x * cosY + p.z * sinY;
  const z1 = -p.x * sinY + p.z * cosY;

  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const y2 = p.y * cosX - z1 * sinX;
  const z2 = p.y * sinX + z1 * cosX;

  const scale = PERSPECTIVE / (PERSPECTIVE - z2);
  return { x: x1 * scale, y: y2 * scale, scale, z: z2 };
}

/** Point opacity from projected depth. Far points stay visible, just quiet. */
export function depthOpacity(z: number): number {
  const t = Math.min(1, Math.max(0, (z + 1) / 2));
  return 0.18 + t * 0.72;
}

/**
 * Progress per interest area, 0 (untouched) to 1 (everything mastered).
 *
 * A group missing from the record reads as 0. Callers therefore never have to
 * construct a complete map, and a new learner needs no row anywhere.
 */
export type GroupProgress = Readonly<Record<string, number>>;

/**
 * How lit an untouched region is.
 *
 * Half brightness, not a whisper. An unearned region still has to look like a
 * real part of the picture — the reward for mastering something is that its
 * cluster comes forward, not that the rest of the map was hidden until then.
 */
export const UNLIT = 0.5;

/** How lit a fully mastered region is. */
export const LIT = 1;

/**
 * How brightly a region burns, given how much of it the learner has mastered.
 *
 * Deliberately not linear at the bottom: the first mastered milestone in a dark
 * region should be visible from across the room, because that is the moment the
 * picture is trying to reward. Later ones fill in more gently.
 */
export function groupOpacity(progress: GroupProgress, groupId: string): number {
  const raw = progress[groupId];
  const p   = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw as number)) : 0;
  return UNLIT + (LIT - UNLIT) * Math.sqrt(p);
}
