"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@/lib/notes/api";
import type { Note, NoteImage, NoteImageFlag, NoteMessage, NotebookWithNotes } from "@/types";

// Single source of truth for the Notes workspace (mirrors the useInterview rule:
// one hook owns session state, components receive state + handlers via props).
// Owns the tree, the selected note, its screenshots, the selected screenshot,
// and that screenshot's chat thread. Threads are per screenshot: selecting a
// screenshot loads its own thoughts + coaching.

export interface UseNotes {
  // data
  tree: NotebookWithNotes[];
  selectedNote: Note | null;
  images: NoteImage[];
  selectedImageId: string | null;
  selectedImage: NoteImage | null;
  messages: NoteMessage[];
  summary: string | null;
  // status
  loadingTree: boolean;
  loadingImages: boolean;
  loadingThread: boolean;
  coaching: boolean;
  summarizing: boolean;
  uploading: boolean;
  error: string | null;
  // selection
  selectNote: (id: string) => void;
  selectImage: (id: string) => void;
  clearError: () => void;
  // tree mutations
  addNotebook: () => Promise<void>;
  renameNotebook: (id: string, title: string) => Promise<void>;
  removeNotebook: (id: string) => Promise<void>;
  addNote: (notebookId: string) => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  // screenshots + their threads
  addImage: (file: File) => Promise<void>;
  renameImage: (id: string, title: string) => Promise<void>;
  flagImage: (id: string, flag: NoteImageFlag | null) => Promise<void>;
  removeImage: (id: string) => Promise<void>;
  saveThought: (content: string) => Promise<void>;
  runCoach: () => Promise<void>;
  runSummary: () => Promise<void>;
}

export function useNotes(): UseNotes {
  const [tree, setTree] = useState<NotebookWithNotes[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [images, setImages] = useState<NoteImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NoteMessage[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [coaching, setCoaching] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Something went wrong.");
  }, []);

  const selectedNote = useMemo<Note | null>(() => {
    if (!selectedNoteId) return null;
    for (const nb of tree) {
      const n = nb.notes.find((x) => x.id === selectedNoteId);
      if (n) return n;
    }
    return null;
  }, [tree, selectedNoteId]);

  const selectedImage = useMemo<NoteImage | null>(
    () => images.find((i) => i.id === selectedImageId) ?? null,
    [images, selectedImageId],
  );

  // ── Initial tree load ────────────────────────────────────────────────────
  // setState only runs after the await, so it isn't a synchronous effect update
  // (loadingTree already starts true, so the pane shows a spinner immediately).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await api.fetchTree();
        if (cancelled) return;
        setTree(t);
        // Auto-select the first note so the workspace isn't blank on entry.
        setSelectedNoteId((cur) => cur ?? t.find((nb) => nb.notes.length > 0)?.notes[0]?.id ?? null);
      } catch (e) {
        if (!cancelled) fail(e);
      } finally {
        if (!cancelled) setLoadingTree(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fail]);

  // ── Load a note's screenshots when the selection changes ──────────────────
  // Auto-selects the first screenshot so its thread shows immediately; the
  // thread itself is loaded by the effect below (keyed on selectedImageId).
  useEffect(() => {
    if (!selectedNoteId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoadingImages(true);
    (async () => {
      try {
        const imgs = await api.fetchImages(selectedNoteId);
        if (cancelled) return;
        setImages(imgs);
        setSelectedImageId(imgs[0]?.id ?? null);
      } catch (e) {
        if (!cancelled) fail(e);
      } finally {
        if (!cancelled) setLoadingImages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedNoteId, fail]);

  // ── Load the selected screenshot's thread ─────────────────────────────────
  // When nothing is selected the thread is cleared by the handlers that clear
  // the selection, so this effect only ever fetches.
  useEffect(() => {
    if (!selectedImageId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoadingThread(true);
    (async () => {
      try {
        const msgs = await api.fetchMessages(selectedImageId);
        if (cancelled) return;
        setMessages(msgs);
        setSummary(null); // a freshly loaded thread invalidates any prior summary
      } catch (e) {
        if (!cancelled) fail(e);
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedImageId, fail]);

  // ── Selection ─────────────────────────────────────────────────────────────
  // Selecting a note resets the screenshot/thread (the note-load effect picks the
  // first screenshot once its images arrive).
  const selectNote = useCallback((id: string) => {
    setSelectedNoteId(id);
    setSelectedImageId(null);
    setMessages([]);
  }, []);

  const selectImage = useCallback((id: string) => {
    setSelectedImageId(id);
    setMessages([]);
    setSummary(null);
  }, []);

  // Drop everything below the tree when nothing is selected.
  const clearNote = useCallback(() => {
    setSelectedNoteId(null);
    setImages([]);
    setSelectedImageId(null);
    setMessages([]);
    setSummary(null);
  }, []);
  const clearError = useCallback(() => setError(null), []);

  // ── Tree mutations ─────────────────────────────────────────────────────────
  const addNotebook = useCallback(async () => {
    try {
      const nb = await api.createNotebook();
      setTree((t) => [...t, { ...nb, notes: [] }]);
    } catch (e) { fail(e); }
  }, [fail]);

  const renameNotebook = useCallback(async (id: string, title: string) => {
    try {
      const nb = await api.renameNotebook(id, title);
      setTree((t) => t.map((x) => (x.id === id ? { ...x, title: nb.title } : x)));
    } catch (e) { fail(e); }
  }, [fail]);

  const removeNotebook = useCallback(async (id: string) => {
    try {
      await api.deleteNotebook(id);
      // If the open note lived in this notebook, clear the loaded content too.
      const hadSelected = tree.find((nb) => nb.id === id)?.notes.some((n) => n.id === selectedNoteId);
      setTree((t) => t.filter((x) => x.id !== id));
      if (hadSelected) clearNote();
    } catch (e) { fail(e); }
  }, [fail, tree, selectedNoteId, clearNote]);

  const addNote = useCallback(async (notebookId: string) => {
    try {
      const note = await api.createNote(notebookId);
      setTree((t) => t.map((nb) => (nb.id === notebookId ? { ...nb, notes: [...nb.notes, note] } : nb)));
      selectNote(note.id);
    } catch (e) { fail(e); }
  }, [fail, selectNote]);

  const renameNote = useCallback(async (id: string, title: string) => {
    try {
      const note = await api.renameNote(id, title);
      setTree((t) => t.map((nb) => ({
        ...nb,
        notes: nb.notes.map((n) => (n.id === id ? { ...n, title: note.title } : n)),
      })));
    } catch (e) { fail(e); }
  }, [fail]);

  const removeNote = useCallback(async (id: string) => {
    try {
      await api.deleteNote(id);
      setTree((t) => t.map((nb) => ({ ...nb, notes: nb.notes.filter((n) => n.id !== id) })));
      if (selectedNoteId === id) clearNote();
    } catch (e) { fail(e); }
  }, [fail, selectedNoteId, clearNote]);

  // ── Screenshots ────────────────────────────────────────────────────────────
  const addImage = useCallback(async (file: File) => {
    if (!selectedNoteId) return;
    setUploading(true);
    try {
      const img = await api.uploadImage(selectedNoteId, file);
      setImages((xs) => [...xs, img]);
      // Focus the new screenshot so its (empty) thread is ready to write into.
      selectImage(img.id);
    } catch (e) { fail(e); }
    finally { setUploading(false); }
  }, [selectedNoteId, fail, selectImage]);

  const renameImage = useCallback(async (id: string, title: string) => {
    try {
      const img = await api.renameImage(id, title);
      setImages((xs) => xs.map((x) => (x.id === id ? { ...x, title: img.title } : x)));
    } catch (e) { fail(e); }
  }, [fail]);

  const flagImage = useCallback(async (id: string, flag: NoteImageFlag | null) => {
    try {
      const img = await api.setImageFlag(id, flag);
      setImages((xs) => xs.map((x) => (x.id === id ? { ...x, flag: img.flag } : x)));
    } catch (e) { fail(e); }
  }, [fail]);

  const removeImage = useCallback(async (id: string) => {
    try {
      await api.deleteImage(id);
      // Deleting the row cascades its thread away server-side. Re-point the
      // selection to a neighbouring screenshot (or none) if we removed the open
      // one; the thread effect reloads for the new selection.
      const next = images.filter((x) => x.id !== id);
      setImages(next);
      if (selectedImageId === id) {
        setSelectedImageId(next[0]?.id ?? null);
        setMessages([]); // thread effect refetches for the new selection, if any
      }
    } catch (e) { fail(e); }
  }, [fail, images, selectedImageId]);

  // ── This screenshot's thread ──────────────────────────────────────────────
  const saveThought = useCallback(async (content: string) => {
    if (!selectedImageId) return;
    try {
      const msg = await api.postMessage(selectedImageId, content);
      setMessages((xs) => [...xs, msg]);
      setSummary(null); // thread changed → the summary is now stale
    } catch (e) { fail(e); }
  }, [selectedImageId, fail]);

  const runCoach = useCallback(async () => {
    if (!selectedImageId) return;
    setCoaching(true);
    try {
      const msg = await api.coach(selectedImageId);
      setMessages((xs) => [...xs, msg]);
      setSummary(null); // thread changed → the summary is now stale
    } catch (e) { fail(e); }
    finally { setCoaching(false); }
  }, [selectedImageId, fail]);

  // Generate (or regenerate) the running summary of this screenshot's thread.
  const runSummary = useCallback(async () => {
    if (!selectedImageId) return;
    setSummarizing(true);
    try {
      const text = await api.summarize(selectedImageId);
      setSummary(text);
    } catch (e) { fail(e); }
    finally { setSummarizing(false); }
  }, [selectedImageId, fail]);

  return {
    tree, selectedNote, images, selectedImageId, selectedImage, messages, summary,
    loadingTree, loadingImages, loadingThread, coaching, summarizing, uploading, error,
    selectNote, selectImage, clearError,
    addNotebook, renameNotebook, removeNotebook,
    addNote, renameNote, removeNote,
    addImage, renameImage, flagImage, removeImage, saveThought, runCoach, runSummary,
  };
}
