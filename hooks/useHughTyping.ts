"use client";

import { useEffect, useState } from "react";

/** Milliseconds between characters as Hugh "types" his solution. */
const CHAR_INTERVAL_MS = 42;

export interface HughTyping {
  /** The portion of the solution revealed so far. */
  typed: string;
  /** True once the whole solution is on screen. */
  done: boolean;
}

/**
 * Drives Hugh's ghost-typing animation. He is a pacer/demo, not an opponent —
 * his code appears character-by-character only while the rung is `active`
 * (state === RACING), and resets whenever the solution (rung) changes.
 */
export function useHughTyping(solution: string, active: boolean): HughTyping {
  const [count, setCount] = useState(0);

  // New rung → start typing from scratch. Resetting during render (rather than
  // in an effect) avoids a flash of the previous rung's progress.
  const [prevSolution, setPrevSolution] = useState(solution);
  if (solution !== prevSolution) {
    setPrevSolution(solution);
    setCount(0);
  }

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setCount((c) => (c >= solution.length ? c : c + 1));
    }, CHAR_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, solution]);

  return {
    typed: solution.slice(0, count),
    done: count >= solution.length,
  };
}
