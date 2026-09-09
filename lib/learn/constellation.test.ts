import { describe, it, expect } from "vitest";
import {
  IDEA_GROUPS,
  POINT_COUNT,
  CORE_LABEL,
  buildConstellation,
  project,
  depthOpacity,
  PERSPECTIVE,
  groupOpacity,
  UNLIT,
  LIT,
  regionCentre,
  regionCentres,
  orbitPosition,
  orbitTilt,
  ORBIT_RADIUS,
} from "./constellation";

const built = buildConstellation();

describe("the groups", () => {
  it("gives every group a unique id and colour, so clusters stay tellable apart", () => {
    expect(new Set(IDEA_GROUPS.map(g => g.id)).size).toBe(IDEA_GROUPS.length);
    expect(new Set(IDEA_GROUPS.map(g => g.color)).size).toBe(IDEA_GROUPS.length);
  });

  it("offers concepts rather than tools, which is what Hugh Learn teaches", () => {
    // Not decoration: this is the first thing a learner reads, and a field of
    // product names would promise the hands-on track Hugh cannot build.
    const labels = IDEA_GROUPS.flatMap(g => g.labels).join(" | ").toLowerCase();
    for (const tool of ["airflow", "dbt", "snowflake", "power bi", "tableau", "spark", "excel"]) {
      expect(labels).not.toContain(tool);
    }
  });

  it("never repeats a label across groups, which would read as a mistake", () => {
    const all = IDEA_GROUPS.flatMap(g => g.labels);
    expect(new Set(all).size).toBe(all.length);
  });

  it("puts data at the centre rather than making it one discipline among five", () => {
    expect(CORE_LABEL).toBe("Data");
    expect(IDEA_GROUPS.map(g => g.label)).not.toContain(CORE_LABEL);
  });
});

describe("buildConstellation", () => {
  it("draws the same sphere every time, so server and browser agree", () => {
    // The layout is generated, not authored. If it used Math.random the markup
    // would differ between the server render and the browser one, and React
    // would report a hydration mismatch on the landing screen of the app.
    const a = buildConstellation();
    const b = buildConstellation();
    expect(a.points).toEqual(b.points);
    expect(a.edges).toEqual(b.edges);
  });

  it("produces the stated number of points", () => {
    expect(built.points).toHaveLength(POINT_COUNT);
  });

  it("gives every point a real group", () => {
    const ids = new Set(IDEA_GROUPS.map(g => g.id));
    for (const p of built.points) expect(ids.has(p.group)).toBe(true);
  });

  it("uses every group, so no discipline silently disappears from the sphere", () => {
    for (const g of IDEA_GROUPS) {
      expect(built.points.some(p => p.group === g.id), `${g.id} has no points`).toBe(true);
    }
  });

  it("keeps every point inside the sphere", () => {
    for (const p of built.points) {
      const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
      expect(r).toBeLessThanOrEqual(1.0001);
      expect(r).toBeGreaterThan(0);
    }
  });

  it("labels only a small minority, which is what makes the rest read as depth", () => {
    const labelled = built.points.filter(p => p.label);
    expect(labelled.length).toBeGreaterThan(0);
    expect(labelled.length).toBeLessThan(POINT_COUNT * 0.2);
  });

  it("places every group's labels somewhere in that group", () => {
    // A label rendered on a point of the wrong colour would quietly undo the
    // one thing the clustering is for.
    for (const g of IDEA_GROUPS) {
      for (const label of g.labels) {
        const host = built.points.find(p => p.label === label);
        expect(host, `"${label}" was never placed`).toBeDefined();
        expect(host!.group).toBe(g.id);
      }
    }
  });

  it("never draws an edge between points of different groups", () => {
    const groupOf = new Map(built.points.map(p => [p.id, p.group]));
    for (const e of built.edges) {
      expect(groupOf.get(e.from)).toBe(groupOf.get(e.to));
    }
  });

  it("never draws an edge to a point that does not exist, or to itself", () => {
    const ids = new Set(built.points.map(p => p.id));
    for (const e of built.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
      expect(e.from).not.toBe(e.to);
    }
  });
});

describe("project — the rotation that makes it a sphere and not a splatter", () => {
  it("leaves a point where it was when nothing is rotated", () => {
    const p = project({ x: 0.5, y: -0.25, z: 0 }, 0, 0);
    expect(p.x).toBeCloseTo(0.5 * p.scale, 6);
    expect(p.y).toBeCloseTo(-0.25 * p.scale, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it("swings a point round to the back after half a turn", () => {
    const front = project({ x: 0, y: 0, z: 1 }, 0, 0);
    const back  = project({ x: 0, y: 0, z: 1 }, Math.PI, 0);
    expect(front.z).toBeCloseTo(1, 6);
    expect(back.z).toBeCloseTo(-1, 6);
  });

  it("draws nearer points larger, which is the whole perspective cue", () => {
    const near = project({ x: 0, y: 0, z: 1 }, 0, 0);
    const far  = project({ x: 0, y: 0, z: -1 }, 0, 0);
    expect(near.scale).toBeGreaterThan(1);
    expect(far.scale).toBeLessThan(1);
  });

  it("keeps the projection finite for every point on the sphere", () => {
    // The scale divides by (PERSPECTIVE - z). If a point could ever reach the
    // camera the whole field would blow up to Infinity and vanish.
    expect(PERSPECTIVE).toBeGreaterThan(1);
    for (const p of built.points) {
      for (const rot of [0, 1, 2, 3, 4, 5, 6]) {
        const q = project(p, rot, rot / 2);
        expect(Number.isFinite(q.x)).toBe(true);
        expect(Number.isFinite(q.y)).toBe(true);
        expect(q.scale).toBeGreaterThan(0);
      }
    }
  });

  it("rotates about X as well, so the sphere can be tipped", () => {
    const p = project({ x: 0, y: 1, z: 0 }, 0, Math.PI / 2);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(1, 6);
  });
});

describe("depthOpacity", () => {
  it("fades the back of the sphere without hiding it", () => {
    expect(depthOpacity(-1)).toBeGreaterThan(0.1);
    expect(depthOpacity(-1)).toBeLessThan(depthOpacity(1));
    expect(depthOpacity(1)).toBeLessThanOrEqual(1);
  });

  it("clamps a depth from outside the sphere rather than producing a negative alpha", () => {
    expect(depthOpacity(-9)).toBeGreaterThan(0);
    expect(depthOpacity(9)).toBeLessThanOrEqual(1);
  });
});

describe("groupOpacity — the brain lighting up", () => {
  it("leaves an untouched region dim but still visible", () => {
    // A learner on day one should see unlit potential, not a broken graphic.
    expect(groupOpacity({}, "ml")).toBe(UNLIT);
    expect(UNLIT).toBeGreaterThan(0.05);
  });

  it("burns a fully mastered region at full brightness", () => {
    expect(groupOpacity({ ml: 1 }, "ml")).toBeCloseTo(LIT, 6);
  });

  it("makes the FIRST milestone in a dark region the most visible one", () => {
    // The curve is deliberately steep at the bottom: going from nothing to
    // something is the moment worth rewarding, and a linear ramp would make it
    // almost invisible.
    const first  = groupOpacity({ ml: 0.1 }, "ml") - groupOpacity({ ml: 0 }, "ml");
    const later  = groupOpacity({ ml: 1 }, "ml")   - groupOpacity({ ml: 0.9 }, "ml");
    expect(first).toBeGreaterThan(later);
  });

  it("never lets one region's progress light another", () => {
    const progress = { ml: 1 };
    expect(groupOpacity(progress, "cloud")).toBe(UNLIT);
  });

  it("treats a missing, negative or nonsense value as untouched rather than dark", () => {
    expect(groupOpacity({ ml: -3 }, "ml")).toBe(UNLIT);
    expect(groupOpacity({ ml: NaN }, "ml")).toBe(UNLIT);
    expect(groupOpacity({}, "nope")).toBe(UNLIT);
  });

  it("clamps an over-100% region rather than blowing past full brightness", () => {
    expect(groupOpacity({ ml: 4 }, "ml")).toBe(LIT);
  });
});

describe("orbits — the work a learner has in flight", () => {
  it("knows a centre for every region, and none for anything else", () => {
    for (const g of IDEA_GROUPS) expect(regionCentre(g.id)).not.toBeNull();
    expect(regionCentre("not-a-region")).toBeNull();
  });

  it("uses the same centres the field itself was clustered around", () => {
    // If these drifted apart, a learner's work would pass over a cluster it
    // does not belong to — which is the one thing the orbit is saying.
    const centres = regionCentres();
    expect(centres).toHaveLength(IDEA_GROUPS.length);
    IDEA_GROUPS.forEach((g, i) => {
      expect(regionCentre(g.id)).toEqual(centres[i]);
    });
  });

  it("traces a shell around the core, just outside the field", () => {
    // A great circle, not a small ring near one cluster. The earlier design
    // put a little circle beside its cluster and it read as a stray point:
    // nothing about a small circle says "this is going round something".
    const centre = regionCentre("ml")!;
    for (const angle of [0, 1, 2, 3, 4, 5, 6]) {
      const p = orbitPosition(centre, angle);
      const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
      expect(r).toBeCloseTo(ORBIT_RADIUS, 6);
    }
    expect(ORBIT_RADIUS).toBeGreaterThan(1);
  });

  it("passes directly over its own cluster once a lap", () => {
    // How the region association survives the bigger shape.
    const centre = regionCentre("cloud")!;
    const p = orbitPosition(centre, 0);
    const len = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
    const dot = (p.x * centre.x + p.y * centre.y + p.z * centre.z) / len;
    expect(dot).toBeCloseTo(1, 6);
  });

  it("goes right round: half a lap lands on the far side of the core", () => {
    const centre = regionCentre("stats")!;
    const a = orbitPosition(centre, 0);
    const b = orbitPosition(centre, Math.PI);
    expect(b.x).toBeCloseTo(-a.x, 6);
    expect(b.y).toBeCloseTo(-a.y, 6);
    expect(b.z).toBeCloseTo(-a.z, 6);
  });

  it("returns to where it started after a full turn", () => {
    const centre = regionCentre("stats")!;
    const a = orbitPosition(centre, 0.4, 1.1);
    const b = orbitPosition(centre, 0.4 + Math.PI * 2, 1.1);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
  });

  it("survives a cluster sitting exactly on an axis", () => {
    // The perpendicular is built with a cross product, which collapses to zero
    // if the seed vector is parallel to the centre — putting the whole orbit
    // at the origin, inside the core.
    const pole = orbitPosition({ x: 0, y: 1, z: 0 }, 1.1);
    const r = Math.sqrt(pole.x ** 2 + pole.y ** 2 + pole.z ** 2);
    expect(r).toBeCloseTo(ORBIT_RADIUS, 6);
  });
});

describe("orbit planes — why it reads as a shell and not a wheel", () => {
  const centre = regionCentre("ml")!;

  it("carries the mote in front of the core and then behind it", () => {
    // Depth changing over the lap is the cue. A ring that never crossed the
    // core would be a circle painted on glass.
    const zs = [0, 1, 2, 3, 4, 5, 6].map(a => orbitPosition(centre, a, 1.1).z);
    expect(Math.min(...zs)).toBeLessThan(0);
    expect(Math.max(...zs)).toBeGreaterThan(0);
  });

  it("keeps every orbit plane through its own cluster, whatever the tilt", () => {
    for (let i = 0; i < 8; i++) {
      const p = orbitPosition(centre, 0, orbitTilt(i));
      const len = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
      const dot = (p.x * centre.x + p.y * centre.y + p.z * centre.z) / len;
      expect(dot).toBeCloseTo(1, 6);
    }
  });

  it("gives consecutive orbits different planes, so two in one region cross", () => {
    expect(orbitTilt(0)).not.toBeCloseTo(orbitTilt(1), 6);
    expect(orbitTilt(1)).not.toBeCloseTo(orbitTilt(2), 6);

    const a = orbitPosition(centre, Math.PI / 2, orbitTilt(0));
    const b = orbitPosition(centre, Math.PI / 2, orbitTilt(1));
    const apart = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
    expect(apart).toBeGreaterThan(0.2);
  });

  it("stays on the shell for every tilt it will ever use", () => {
    for (let i = 0; i < 8; i++) {
      for (const a of [0, 1.5, 3, 4.5, 6]) {
        const p = orbitPosition(centre, a, orbitTilt(i));
        const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
        expect(r).toBeCloseTo(ORBIT_RADIUS, 6);
      }
    }
  });
});
