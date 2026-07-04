import { RotateCcw, Trophy, Timer } from "lucide-react";
import type { LadderState } from "@/types/code";

interface Props {
  state: LadderState;
  rungReached: number; // 0-based index of the rung the run ended on
  total: number;
  onRestart: () => void;
}

/** Full-screen end states: cleared the whole ladder, or ran out of time. */
export default function ResultOverlay({ state, rungReached, total, onRestart }: Props) {
  if (state !== "GAME_OVER" && state !== "WON") return null;
  const won = state === "WON";

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#0A0F1E]/85 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div
          className={`mb-5 grid h-16 w-16 place-items-center rounded-full ${
            won ? "bg-amber-400/15 text-amber-300" : "bg-red-500/15 text-red-400"
          }`}
        >
          {won ? <Trophy size={30} /> : <Timer size={30} />}
        </div>
        <h2 className="text-2xl font-semibold text-slate-100">
          {won ? "Ladder cleared!" : "Time's up"}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {won
            ? `You cleared all ${total} rungs. Run it back for speed.`
            : `You reached rung ${rungReached + 1} of ${total}. The ladder resets — try again.`}
        </p>
        <button
          onClick={onRestart}
          className="mt-7 flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-400"
        >
          <RotateCcw size={16} />
          {won ? "Play again" : "Restart ladder"}
        </button>
      </div>
    </div>
  );
}
