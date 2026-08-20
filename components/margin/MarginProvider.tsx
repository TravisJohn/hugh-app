"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useMarginNote, type MarginNoteState } from "@/hooks/useMarginNote";
import type { MarginSurface } from "@/types/margin";

// One owner for the margin's state (Architecture Rule 2).
//
// A provider rather than props because the two halves of the margin sit on
// opposite sides of the page: the pad is docked in the right rail, but the "pull
// this section in" buttons live on the headings in the reading column. They must
// share one note, and passing state between two branches of a server-rendered
// tree is exactly what context is for.
//
// The children stay server-rendered — only this wrapper and the two consumers
// are client components.

interface MarginContext extends MarginNoteState {
  /**
   * Bumped whenever something outside the pad wants the pad's attention — the
   * rail watches it to switch to the Notes tab, the pad to take focus. A
   * counter rather than a boolean so two clicks in a row both register.
   */
  focusNonce:   number;
  requestFocus: () => void;
}

const Ctx = createContext<MarginContext | null>(null);

export function useMargin(): MarginContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMargin must be used inside <MarginProvider>");
  return ctx;
}

interface Props {
  surface:     MarginSurface;
  refId:       string;
  refLabel:    string;
  refHref:     string;
  initialBody: string;
  children:    React.ReactNode;
}

export default function MarginProvider({
  surface, refId, refLabel, refHref, initialBody, children,
}: Props) {
  const note = useMarginNote({ surface, refId, refLabel, refHref, initialBody });
  const [focusNonce, setFocusNonce] = useState(0);

  const requestFocus = useCallback(() => setFocusNonce(n => n + 1), []);

  const value = useMemo<MarginContext>(
    () => ({ ...note, focusNonce, requestFocus }),
    [note, focusNonce, requestFocus],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
