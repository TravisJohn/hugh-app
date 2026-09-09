// ── The refinement network ───────────────────────────────────────────────────
//
// What the learner sees beside the five refinement questions: a small network
// diagram, one hidden layer per question, lighting up a layer at a time as they
// answer.
//
// It replaced a stack of quote cards. The cards were honest but they read as a
// transcript — proof you had been asked things — where this reads as something
// being assembled out of the answers, which is nearer the truth: the answers
// are what the track is generated from. A learner four questions in should be
// able to see that stopping now costs them something.
//
// Pure and deterministic. The layout is arithmetic, and the lit state is a
// function of how many answers exist, so both can be tested without a DOM.

/**
 * How many nodes each question's layer holds.
 *
 * Widening, so the diagram opens out as the learner answers: what they say
 * fans into more of the track, and the picture gets denser rather than merely
 * longer. The widths carry no meaning beyond that shape — the number of LAYERS
 * is the part that means something, and it must match the number of questions.
 */
export const HIDDEN_WIDTHS: readonly number[] = [10, 20, 30, 40, 50];

/**
 * How many nodes in the next layer each node reaches.
 *
 * Not all of them. Fully connecting 40 nodes to 50 is two thousand lines that
 * overlap into a grey block — denser than a network and less legible than one.
 * A short local fan keeps the woven look while staying countable, and keeps the
 * element count in the hundreds rather than the thousands.
 */
export const FAN_OUT = 3;

/** Layers, counting the topic going in and the track coming out. */
export const LAYER_COUNT = HIDDEN_WIDTHS.length + 2;

export interface NetNode {
  id:    string;
  layer: number;
  x:     number;
  y:     number;
}

export interface NetEdge {
  from: string;
  to:   string;
}

/**
 * Node positions in a 0..1 box, and every connection between adjacent layers.
 *
 * A single node in a layer sits in the middle rather than at the top: the input
 * and output layers each have one, and an off-centre entry would make the whole
 * diagram look like it had lost a row.
 */
export function buildNetwork(): { nodes: NetNode[]; edges: NetEdge[] } {
  const widths = [1, ...HIDDEN_WIDTHS, 1];

  const nodes: NetNode[] = [];
  widths.forEach((count, layer) => {
    for (let i = 0; i < count; i++) {
      nodes.push({
        id:    `l${layer}n${i}`,
        layer,
        x:     widths.length === 1 ? 0.5 : layer / (widths.length - 1),
        y:     count === 1 ? 0.5 : 0.5 + (i - (count - 1) / 2) * (0.94 / Math.max(1, count - 1)),
      });
    }
  });

  const edges: NetEdge[] = [];
  for (let layer = 0; layer < widths.length - 1; layer++) {
    const from = nodes.filter(n => n.layer === layer);
    const to   = nodes.filter(n => n.layer === layer + 1);

    // A layer of one — the topic going in, the track coming out — joins to
    // everything. Those two fans are the funnel shape at each end, and they are
    // small enough to draw in full.
    if (from.length === 1 || to.length === 1) {
      for (const a of from) for (const b of to) edges.push({ from: a.id, to: b.id });
      continue;
    }

    // Otherwise each node reaches the handful of nodes opposite it, found by
    // position rather than index so the fan stays even when the layers differ
    // in size.
    from.forEach((a, i) => {
      const centre = Math.round((i * (to.length - 1)) / Math.max(1, from.length - 1));
      const half   = Math.floor(FAN_OUT / 2);
      for (let k = centre - half; k <= centre + half; k++) {
        const b = to[k];
        if (b) edges.push({ from: a.id, to: b.id });
      }
    });
  }

  return { nodes, edges };
}

/**
 * - `done`    — this layer has its answer and burns steadily.
 * - `active`  — the thing happening right now. Pulses.
 * - `waiting` — not reached. Barely there.
 */
export type LayerState = "done" | "active" | "waiting";

/**
 * Which half of refinement the learner is in.
 *
 * `asking` — a question is on screen waiting for an answer.
 * `building` — the questions are over and the track is being generated. Reached
 *   by answering them all, by Hugh deciding it has enough, or by Skip; the
 *   diagram must not care which, because all three mean the same thing to the
 *   person watching.
 */
export type RefinementPhase = "asking" | "building";

/**
 * How lit a layer is.
 *
 * The input layer is always `done`: the learner has already given a topic by
 * the time any of this is on screen, and showing it as unlit would suggest the
 * thing they definitely did had not registered.
 *
 * The output layer is `active` — glowing — for the whole of `building`,
 * whatever the answer count. Refinement does not always run to five questions:
 * Hugh can decide it has enough after three, and Skip ends it at any point. An
 * output that lit only on a full set would leave those learners watching a dead
 * diagram while their track was actually being built, which is the one moment
 * it most needs to look alive.
 *
 * Unanswered question layers stay dark through `building`, because they are
 * still unanswered. The diagram reports what happened, not what was hoped for.
 */
export function layerState(
  layer:    number,
  answered: number,
  phase:    RefinementPhase,
): LayerState {
  if (layer <= 0) return "done";

  if (layer >= LAYER_COUNT - 1) return phase === "building" ? "active" : "waiting";

  if (answered >= layer) return "done";
  if (phase === "asking" && answered === layer - 1) return "active";
  return "waiting";
}
