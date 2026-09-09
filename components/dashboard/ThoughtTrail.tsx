"use client";

import { useMemo } from "react";
import {
  buildNetwork,
  layerState,
  HIDDEN_WIDTHS,
  LAYER_COUNT,
  type RefinementPhase,
} from "@/lib/learn/network";

export interface Thought {
  question: string;
  answer:   string;
}

interface Props {
  topic:    string;
  thoughts: Thought[];
  /**
   * Asking, or building the track. Decides which layer is lit as the live one —
   * the question on screen, or the output while the track is generated.
   */
  phase:    RefinementPhase;
}

// The working half of /home/learn: a small network being assembled out of the
// learner's answers, one layer per question.
//
// It replaced a stack of quote cards. The cards were honest but they read as a
// transcript — proof you had been asked things — where this reads as something
// being BUILT from the answers, which is nearer the truth: the answers are what
// the track is generated from. Someone four questions in can see that stopping
// now leaves the last layer dark.
//
// The geometry and the lit state live in lib/learn/network.ts, tested. This
// file paints, and the glow is CSS.
export default function ThoughtTrail({ topic, thoughts, phase }: Props) {
  const { nodes, edges } = useMemo(() => buildNetwork(), []);
  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const answered = thoughts.length;
  const building = phase === "building";

  // Coordinates in a padded box, so a node's glow at the edge is not clipped.
  const px = (x: number) => 4 + x * 92;
  const py = (y: number) => 3 + y * 94;

  const stateOf = (layer: number) => layerState(layer, answered, phase);
  const styleFor = (state: ReturnType<typeof stateOf>) =>
    state === "done"   ? { fill: "#fbbf24", opacity: 0.95, glow: true }
    // Brighter than 'done', not dimmer. This is the layer something is
    // happening in — while the track builds it is the only one moving, and a
    // half-lit output would read as a diagram that had stalled.
    : state === "active" ? { fill: "#fde68a", opacity: 1, glow: true }
    : { fill: "#f59e0b", opacity: 0.22, glow: false };

  // Everything shares the diagram's centre line. Left-aligned text beside a
  // centred diagram reads as two things that happened to be placed near each
  // other, which is exactly how it looked.
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
          Building your track
        </p>
        <p className="mt-1 text-lg font-bold tracking-tight text-slate-200">{topic}</p>
      </div>

      <svg viewBox="0 0 100 100" className="w-full" style={{ maxHeight: "30rem" }} aria-hidden="true">
        <defs>
          <filter id="net-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="0.7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Connections first, so nodes sit on top of them. A connection is only
            as lit as the layer it arrives at — light runs forward through the
            network as answers land, never backward. */}
        {edges.map(e => {
          const a = byId.get(e.from)!;
          const b = byId.get(e.to)!;
          const state = stateOf(b.layer);
          return (
            <line
              key={`${e.from}-${e.to}`}
              x1={px(a.x)} y1={py(a.y)}
              x2={px(b.x)} y2={py(b.y)}
              // One hue for the whole diagram; only brightness carries state.
              //
              // This took three goes. Grey at 10% disappeared, and the band
              // before the next layer read as a hole. Slate at 40% appeared,
              // but as a different MATERIAL — a white bar cutting the network
              // in half, which is arguably worse than the gap. The answer was
              // never the colour: unlit is the same amber, turned down.
              // Measured, not guessed: there are 118 edges between the widest
              // two layers, so an apparently empty band there was never missing
              // structure — it was 0.16 sitting beside neighbours at 0.4 and
              // 0.5, which the eye reads as nothing at all. The unlit band has
              // to stay within reach of its neighbours to read as dimmer rather
              // than as absent; the NODES carry the state distinction, and they
              // are 0.22 against 0.95.
              stroke="#f59e0b"
              strokeWidth={0.16}
              opacity={state === "done" ? 0.5 : state === "active" ? 0.6 : 0.3}
              className="transition-all duration-700"
            />
          );
        })}

        {nodes.map(n => {
          const state = stateOf(n.layer);
          const s = styleFor(state);
          return (
            <circle
              key={n.id}
              cx={px(n.x)} cy={py(n.y)}
              r={n.layer === 0 || n.layer === LAYER_COUNT - 1
                ? (state === "active" ? 1.8 : 1.2)
                : 0.55}
              fill={s.fill}
              opacity={s.opacity}
              filter={s.glow ? "url(#net-glow)" : undefined}
              className={`transition-all duration-700 ${state === "active" ? "animate-pulse" : ""}`}
            />
          );
        })}
      </svg>

      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-slate-500">
          {building
            ? "Building your track from what you told Hugh."
            : answered === 0
            ? "Every answer shapes a layer of your track."
            : `${answered} of ${HIDDEN_WIDTHS.length} layers lit.`}
        </p>
        {/* The most recent answer, small. Enough to know the last one landed,
            without turning this back into the transcript it replaced. */}
        {thoughts.length > 0 && (
          <p className="max-w-[26rem] truncate text-xs italic text-slate-600">
            “{thoughts[thoughts.length - 1]!.answer}”
          </p>
        )}
      </div>
    </div>
  );
}
