"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sortNotes } from "@/lib/margin/notes";
import type { MarginNote, MarginSurface } from "@/types/margin";

// Every margin note on one surface — the review list's state, owned by the
// screen (Architecture Rule 2) and handed down as props.
//
// Lazy on purpose. Most visits to Cloud Skills are browsing, and loading a
// learner's notes for a tab they never open would put a query on the critical
// path of a page whose whole promise is being fast. The fetch fires the first
// time the tab is actually opened, and once only.

export interface MarginNotesState {
  notes:   MarginNote[];
  loading: boolean;
  error:   string | null;
  remove:  (refId: string) => Promise<void>;
}

export function useMarginNotes(surface: MarginSurface, enabled: boolean): MarginNotesState {
  const [notes,   setNotes]   = useState<MarginNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (!enabled || fetched.current) return;
    fetched.current = true;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/margin?surface=${surface}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error ?? "Couldn't load your notes.");
        }
        const { notes: rows } = await res.json() as { notes: MarginNote[] };
        if (!cancelled) setNotes(sortNotes(rows));
      } catch (e) {
        // Allow a retry: a failed load shouldn't lock the tab out for the rest
        // of the session.
        fetched.current = false;
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load your notes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [surface, enabled]);

  const remove = useCallback(async (refId: string) => {
    setError(null);
    // Kept until the server confirms. A note is the learner's own writing, so
    // it must not vanish optimistically and then come back on refresh.
    try {
      const res = await fetch(
        `/api/margin?surface=${surface}&refId=${encodeURIComponent(refId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Couldn't remove that note.");
      }
      setNotes(prev => prev.filter(n => n.ref_id !== refId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that note.");
    }
  }, [surface]);

  return { notes, loading, error, remove };
}
