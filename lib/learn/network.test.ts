import { describe, it, expect } from "vitest";
import {
  buildNetwork,
  layerState,
  HIDDEN_WIDTHS,
  LAYER_COUNT,
  FAN_OUT,
} from "./network";

const { nodes, edges } = buildNetwork();

describe("buildNetwork", () => {
  it("has one hidden layer per refinement question", () => {
    // The one thing here that carries meaning. If these ever disagree, a
    // learner answers a question that lights nothing, or a layer never lights.
    expect(HIDDEN_WIDTHS).toHaveLength(5);
    expect(LAYER_COUNT).toBe(HIDDEN_WIDTHS.length + 2);
  });

  it("gives every node a unique id", () => {
    expect(new Set(nodes.map(n => n.id)).size).toBe(nodes.length);
  });

  it("keeps every node inside the box it is drawn in", () => {
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(1);
    }
  });

  it("centres a lone node instead of hanging it off the top", () => {
    // Input and output each have one. Off-centre, the diagram reads as though
    // it had lost a row.
    const first = nodes.filter(n => n.layer === 0);
    const last  = nodes.filter(n => n.layer === LAYER_COUNT - 1);
    expect(first).toHaveLength(1);
    expect(last).toHaveLength(1);
    expect(first[0]!.y).toBeCloseTo(0.5, 6);
    expect(last[0]!.y).toBeCloseTo(0.5, 6);
  });

  it("spreads the layers evenly from one edge to the other", () => {
    expect(nodes.find(n => n.layer === 0)!.x).toBeCloseTo(0, 6);
    expect(nodes.find(n => n.layer === LAYER_COUNT - 1)!.x).toBeCloseTo(1, 6);
  });

  it("connects only adjacent layers", () => {
    const layerOf = new Map(nodes.map(n => [n.id, n.layer]));
    for (const e of edges) {
      expect(layerOf.get(e.to)! - layerOf.get(e.from)!).toBe(1);
    }
  });

  it("never draws an edge to a node that does not exist", () => {
    const ids = new Set(nodes.map(n => n.id));
    for (const e of edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });

  it("widens layer by layer, so the diagram opens out as answers land", () => {
    for (let i = 1; i < HIDDEN_WIDTHS.length; i++) {
      expect(HIDDEN_WIDTHS[i]!).toBeGreaterThan(HIDDEN_WIDTHS[i - 1]!);
    }
  });

  it("fans each node to a few opposite it rather than to the whole next layer", () => {
    // Fully connecting 40 nodes to 50 is two thousand overlapping lines: denser
    // than a network and less legible than one.
    const counts = new Map<string, number>();
    for (const e of edges) counts.set(e.from, (counts.get(e.from) ?? 0) + 1);
    for (const n of nodes) {
      if (n.layer === 0 || n.layer >= LAYER_COUNT - 2) continue;
      expect(counts.get(n.id) ?? 0).toBeLessThanOrEqual(FAN_OUT);
    }
  });

  it("leaves no node stranded — everything is reachable from the topic", () => {
    // A node with nothing arriving would sit there lighting up for no reason.
    const incoming = new Set(edges.map(e => e.to));
    for (const n of nodes) {
      if (n.layer === 0) continue;
      expect(incoming.has(n.id), `${n.id} has nothing feeding it`).toBe(true);
    }
  });

  it("joins the single-node layers to everything, which is the funnel at each end", () => {
    const first = nodes.find(n => n.layer === 0)!;
    const out   = nodes.find(n => n.layer === LAYER_COUNT - 1)!;
    expect(edges.filter(e => e.from === first.id)).toHaveLength(HIDDEN_WIDTHS[0]!);
    expect(edges.filter(e => e.to === out.id))
      .toHaveLength(HIDDEN_WIDTHS[HIDDEN_WIDTHS.length - 1]!);
  });

  it("stays in the hundreds of elements, not the thousands", () => {
    expect(edges.length).toBeLessThan(600);
  });
});

describe("layerState — what lights, and when", () => {
  it("shows the topic as already in, before a single question is answered", () => {
    // The learner definitely gave a topic. An unlit input layer would suggest
    // the thing they certainly did had not registered.
    expect(layerState(0, 0, "asking")).toBe("done");
  });

  it("marks the question on screen as active, and the ones after it as waiting", () => {
    expect(layerState(1, 0, "asking")).toBe("active");
    expect(layerState(2, 0, "asking")).toBe("waiting");
    expect(layerState(3, 0, "asking")).toBe("waiting");
  });

  it("moves the active layer along as answers land", () => {
    expect(layerState(1, 2, "asking")).toBe("done");
    expect(layerState(2, 2, "asking")).toBe("done");
    expect(layerState(3, 2, "asking")).toBe("active");
    expect(layerState(4, 2, "asking")).toBe("waiting");
  });

  it("holds the output dark while questions are still being asked", () => {
    const out = LAYER_COUNT - 1;
    expect(layerState(out, 0, "asking")).toBe("waiting");
    expect(layerState(out, HIDDEN_WIDTHS.length, "asking")).toBe("waiting");
  });

  it("glows the output for the whole build, however few questions were answered", () => {
    // The case this exists for. Refinement does not always reach five: Hugh can
    // decide it has enough after three, and Skip ends it at any point. Lighting
    // the output only on a full set left those learners watching a dead diagram
    // while their track was actually being built.
    const out = LAYER_COUNT - 1;
    expect(layerState(out, 0, "building")).toBe("active");
    expect(layerState(out, 3, "building")).toBe("active");
    expect(layerState(out, HIDDEN_WIDTHS.length, "building")).toBe("active");
  });

  it("stops pulsing any question layer once the questions are over", () => {
    // Nothing is on screen to answer, so nothing should be asking for an answer.
    expect(layerState(3, 2, "building")).toBe("waiting");
    expect(layerState(1, 2, "building")).toBe("done");
  });

  it("leaves skipped questions dark rather than crediting them", () => {
    // The diagram reports what happened, not what was hoped for.
    expect(layerState(4, 1, "building")).toBe("waiting");
    expect(layerState(5, 1, "building")).toBe("waiting");
  });
});
