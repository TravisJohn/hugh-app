"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { appendStub, normaliseBody } from "@/lib/margin/notes";
import type { MarginSurface } from "@/types/margin";

// The pad's state and its autosave.
//
// This hook carries the whole trust of the feature. It replaces a physical
// notebook, and a jot that silently fails to save is worse than no pad at all —
// paper never loses a sentence. So: everything mutable lives in a ref (a stale
// closure here would save yesterday's text), a save is skipped only when the
// text is genuinely unchanged, the status is always visible to the learner, and
// there are three separate paths out of an unsaved edit.

/** How long typing has to pause before a save fires. */
const DEBOUNCE_MS = 800;

export type MarginSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface MarginNoteState {
  body:   string;
  status: MarginSaveStatus;
  /** Non-null when the last save failed. Shown in the pad, never swallowed. */
  error:  string | null;
  setBody: (next: string) => void;
  /** Pull a section heading into the note; returns false if it was already there. */
  insertStub: (heading: string) => boolean;
  /** Save now — on blur, and before the pad goes away. */
  flush: () => void;
}

interface Params {
  surface:   MarginSurface;
  refId:     string;
  refLabel:  string;
  refHref:   string;
  /** Server-rendered, so the pad opens populated rather than filling in. */
  initialBody: string;
}

export function useMarginNote({
  surface, refId, refLabel, refHref, initialBody,
}: Params): MarginNoteState {
  const [body,   setBodyState] = useState(initialBody);
  const [status, setStatus]    = useState<MarginSaveStatus>("idle");
  const [error,  setError]     = useState<string | null>(null);

  // What is on screen, and what the server last confirmed. Refs rather than
  // state because the unmount and visibility paths read them from inside
  // listeners that were registered once.
  const bodyRef  = useRef(initialBody);
  const savedRef = useRef(initialBody);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((keepalive: boolean) => {
    const text = bodyRef.current;
    if (text === savedRef.current) return;

    // Claimed as saved before the response lands. If the request fails the
    // status flips to error and the text stays dirty, so a failure is loud and
    // a retry still has something to send.
    const inFlight = text;
    setStatus("saving");

    fetch("/api/margin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface,
        ref_id:    refId,
        ref_label: refLabel,
        ref_href:  refHref,
        body:      text,
      }),
      // keepalive lets the save survive the page being closed or navigated
      // away from — the one moment a learner is most likely to lose a jot.
      keepalive,
    })
      .then(async res => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error ?? "Couldn't save that note.");
        }
        savedRef.current = inFlight;
        // Only settle to "saved" if nothing was typed while the request was in
        // flight; otherwise the pad would claim to be saved while holding text
        // the server has never seen.
        setStatus(bodyRef.current === inFlight ? "saved" : "dirty");
        setError(null);
      })
      .catch((e: unknown) => {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Couldn't save that note.");
      });
  }, [surface, refId, refLabel, refHref]);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    save(false);
  }, [save]);

  const setBody = useCallback((next: string) => {
    const text = normaliseBody(next);
    bodyRef.current = text;
    setBodyState(text);
    setStatus(text === savedRef.current ? "saved" : "dirty");

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(false), DEBOUNCE_MS);
  }, [save]);

  const insertStub = useCallback((heading: string): boolean => {
    const next = appendStub(bodyRef.current, heading);
    if (next === bodyRef.current) return false;
    setBody(next);
    return true;
  }, [setBody]);

  // Path two out of an unsaved edit: the tab is hidden or closed. `hidden` is
  // the last event a backgrounded or closing tab reliably delivers, so the save
  // goes out here with keepalive rather than waiting for the debounce.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") save(true); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  // Path three: the pad unmounts — a tab switch in the rail, or a click through
  // to another service. The pending timer would be cleared with the component,
  // taking the edit with it.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      save(true);
    };
  }, [save]);

  return { body, status, error, setBody, insertStub, flush };
}
