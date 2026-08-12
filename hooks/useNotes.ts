"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@/lib/notes/api";
import {
  buildTree, canGroup, pathTo, reindex, type Check, type TreeItem, type TreeKind,
} from "@/lib/notes/tree";
import type {
  Note, Notebook, NoteImageBucket, NoteImageFlag, NoteMessage, NotesTree,
} from "@/types";

// Single source of truth for the Notes workspace (mirrors the useInterview rule:
// one hook owns session state, components receive state + handlers via props).
// Owns the tree, the selected note, its screenshots, the selected screenshot,
// and that screenshot's chat thread. Threads are per screenshot: selecting a
// screenshot loads its own thoughts + coaching.
//
// A screenshot is a *bucket*: one slot that may hold several snips of the same
// tall question. The bucket owns the title, the flag and the thread; its parts
// are just more image bytes stacked under it.

// Where a pasted or dropped image lands. Both + buttons set this, so paste
// keeps doing whatever the learner did last — mid-capture of a tall question
// that means "keep adding to this one".
export type PasteMode = "new" | "current";

// The page open when Notes was last closed. Notes opens collapsed for a clean
// workspace, so without this the learner would have to click their way back
// down the tree every session.
const LAST_NOTE_KEY = "hugh.notes.lastNoteId";

function readLastNoteId(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(LAST_NOTE_KEY); } catch { return null; }
}

function writeLastNoteId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(LAST_NOTE_KEY, id);
    else window.localStorage.removeItem(LAST_NOTE_KEY);
  } catch { /* private mode / storage full — losing the bookmark is harmless */ }
}

// A Ctrl+click selection. It is single-kind by construction: clicking a page
// while notebooks are selected starts a fresh selection, because the two levels
// of the tree can never be grouped together.
export interface TreeSelection {
  kind: TreeKind;
  ids:  string[];
}

export interface UseNotes {
  // data
  tree: NotesTree;
  selectedNote: Note | null;
  buckets: NoteImageBucket[];
  selectedBucketId: string | null;
  selectedBucket: NoteImageBucket | null;
  messages: NoteMessage[];
  summary: string | null;
  // status
  loadingTree: boolean;
  loadingImages: boolean;
  loadingThread: boolean;
  coaching: boolean;
  summarizing: boolean;
  uploading: boolean;
  pasteMode: PasteMode;
  error: string | null;
  // selection
  selectNote: (id: string) => void;
  selectBucket: (id: string) => void;
  setPasteMode: (mode: PasteMode) => void;
  clearError: () => void;
  // Ctrl+click multi-select → grouping
  selection: TreeSelection | null;
  groupCheck: Check | null;
  pendingRenameId: string | null;
  treeItems: TreeItem[];
  moveRow: (
    kind: TreeKind, id: string, parentId: string | null, index: number, notebookId?: string,
  ) => Promise<void>;
  // expand / collapse — Notes opens collapsed, so this tracks what's open
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  expandNode: (id: string) => void;
  // the Bag
  bagItem: (kind: TreeKind, id: string) => Promise<void>;
  unbagItem: (kind: TreeKind, id: string) => Promise<void>;
  bagSelection: () => Promise<void>;
  toggleSelect: (kind: TreeKind, id: string) => void;
  clearSelection: () => void;
  clearPendingRename: () => void;
  groupSelection: () => Promise<void>;
  dissolveGroup: (kind: TreeKind, id: string) => Promise<void>;
  // tree mutations
  addNotebook: () => Promise<void>;
  renameNotebook: (id: string, title: string) => Promise<void>;
  removeNotebook: (id: string) => Promise<void>;
  addNote: (notebookId: string) => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  // screenshots + their threads
  addBucket: (file: File) => Promise<void>;
  addPart: (file: File) => Promise<void>;
  addPasted: (file: File) => Promise<void>;
  renameBucket: (id: string, title: string) => Promise<void>;
  flagBucket: (id: string, flag: NoteImageFlag | null) => Promise<void>;
  removeBucket: (id: string) => Promise<void>;
  removePart: (id: string) => Promise<void>;
  movePart: (id: string, direction: -1 | 1) => Promise<void>;
  saveThought: (content: string) => Promise<void>;
  runCoach: () => Promise<void>;
  runSummary: () => Promise<void>;
}

export function useNotes(): UseNotes {
  // The tree is held FLAT and nested on read. Every mutation is then a plain
  // array update, however deep the row sits — which is what keeps grouping,
  // dissolving and re-parenting from each needing their own tree surgery.
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selection, setSelection] = useState<TreeSelection | null>(null);
  const [pendingRenameId, setPendingRenameId] = useState<string | null>(null);
  // Tracks what is OPEN, not what is closed: an empty set is a fully collapsed
  // tree, which is exactly the state Notes should open in.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<NoteImageBucket[]>([]);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NoteMessage[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState<PasteMode>("new");

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

  const tree = useMemo<NotesTree>(() => buildTree({ notebooks, notes }), [notebooks, notes]);

  // Flat rows in the shape the grouping/moving guards want. Folders and content
  // rows both appear — the guards are what tell them apart.
  const treeItems = useMemo<TreeItem[]>(() => [
    ...notebooks.map((n) => ({
      id: n.id, kind: "notebook" as const, parent_id: n.parent_id, is_group: n.is_group,
    })),
    ...notes.map((n) => ({
      id: n.id, kind: "note" as const, parent_id: n.parent_id, is_group: n.is_group,
      notebook_id: n.notebook_id,
    })),
  ], [notebooks, notes]);

  // Why the current selection can or can't be grouped — the Group button shows
  // the reason rather than silently doing nothing.
  const groupCheck = useMemo<Check | null>(
    () => (selection ? canGroup(selection.ids, treeItems) : null),
    [selection, treeItems],
  );

  const selectedNote = useMemo<Note | null>(
    () => notes.find((n) => n.id === selectedNoteId && !n.is_group) ?? null,
    [notes, selectedNoteId],
  );

  const selectedBucket = useMemo<NoteImageBucket | null>(
    () => buckets.find((b) => b.id === selectedBucketId) ?? null,
    [buckets, selectedBucketId],
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
        setNotebooks(t.notebooks);
        setNotes(t.notes);

        // Reopen the page from last time and expand just the chain down to it.
        // Everything else stays collapsed. A saved id that has since been
        // deleted, bagged, or turned into a folder is ignored — Notes then
        // opens fully collapsed with nothing selected, which is the honest
        // result rather than picking some arbitrary other page.
        const saved = readLastNoteId();
        const target = saved && t.notes.some((n) => n.id === saved && !n.is_group && !n.bagged_at)
          ? saved
          : null;
        if (target) {
          setSelectedNoteId((cur) => cur ?? target);
          setExpanded(pathTo(buildTree(t), target));
        }
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
        const rows = await api.fetchImages(selectedNoteId);
        if (cancelled) return;
        setBuckets(rows);
        setSelectedBucketId(rows[0]?.id ?? null);
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
    if (!selectedBucketId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoadingThread(true);
    (async () => {
      try {
        const msgs = await api.fetchMessages(selectedBucketId);
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
  }, [selectedBucketId, fail]);

  // ── Selection ─────────────────────────────────────────────────────────────
  // Selecting a note resets the screenshot/thread (the note-load effect picks the
  // first screenshot once its images arrive).
  const selectNote = useCallback((id: string) => {
    setSelectedNoteId(id);
    setSelectedBucketId(null);
    setMessages([]);
    writeLastNoteId(id); // so the next session opens here
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandNode = useCallback((id: string) => {
    setExpanded((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);

  const selectBucket = useCallback((id: string) => {
    setSelectedBucketId(id);
    setMessages([]);
    setSummary(null);
  }, []);

  // Drop everything below the tree when nothing is selected.
  const clearNote = useCallback(() => {
    setSelectedNoteId(null);
    setBuckets([]);
    setSelectedBucketId(null);
    setMessages([]);
    setSummary(null);
    writeLastNoteId(null);
  }, []);
  const clearError = useCallback(() => setError(null), []);

  // ── Ctrl+click selection ───────────────────────────────────────────────────
  // Selecting across the two levels of the tree is impossible by construction:
  // clicking a page while notebooks are selected starts a fresh selection,
  // because they could never be grouped together anyway.
  const toggleSelect = useCallback((kind: TreeKind, id: string) => {
    setSelection((cur) => {
      if (!cur || cur.kind !== kind) return { kind, ids: [id] };
      const ids = cur.ids.includes(id) ? cur.ids.filter((x) => x !== id) : [...cur.ids, id];
      return ids.length === 0 ? null : { kind, ids };
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(null), []);
  const clearPendingRename = useCallback(() => setPendingRenameId(null), []);

  // ── Tree mutations ─────────────────────────────────────────────────────────
  // Grouping and dissolving move rows around wholesale, so both refetch the
  // tree rather than trying to replay the server's ordering locally. It's one
  // extra round trip on a rare action, and it can't drift.
  const reloadTree = useCallback(async () => {
    const t = await api.fetchTree();
    setNotebooks(t.notebooks);
    setNotes(t.notes);
  }, []);

  const groupSelection = useCallback(async () => {
    if (!selection || !groupCheck?.ok) return;
    try {
      const group = await api.createGroup(selection.kind, selection.ids);
      await reloadTree();
      setSelection(null);
      // Drop straight into rename mode — a folder called "New group" is only
      // useful for as long as it takes to name it.
      setPendingRenameId(group.id);
    } catch (e) { fail(e); }
  }, [selection, groupCheck, reloadTree, fail]);

  // A drop can shift a whole sibling list, so this refetches rather than trying
  // to replay the server's renumbering locally.
  const moveRow = useCallback(async (
    kind: TreeKind, id: string, parentId: string | null, index: number, notebookId?: string,
  ) => {
    try {
      await api.moveRow(kind, id, parentId, index, notebookId);
      await reloadTree();
    } catch (e) { fail(e); }
  }, [reloadTree, fail]);

  const dissolveGroup = useCallback(async (kind: TreeKind, id: string) => {
    try {
      await api.dissolveGroup(kind, id);
      await reloadTree();
      setSelection(null);
    } catch (e) { fail(e); }
  }, [reloadTree, fail]);

  // ── The Bag ────────────────────────────────────────────────────────────────
  // Tucking something away hides it from the tree without deleting anything. A
  // folder takes its subtree with it, so if the open page ends up inside what
  // was just bagged, the workspace has to let go of it too.
  const applyBagged = useCallback(async (kind: TreeKind, ids: string[], bagged: boolean) => {
    try {
      await Promise.all(ids.map((id) => api.setBagged(kind, id, bagged)));
      const stamp = bagged ? new Date().toISOString() : null;
      const touch = <T extends { id: string; bagged_at: string | null }>(rows: T[]) =>
        rows.map((r) => (ids.includes(r.id) ? { ...r, bagged_at: stamp } : r));

      const nextNotebooks = kind === "notebook" ? touch(notebooks) : notebooks;
      const nextNotes = kind === "note" ? touch(notes) : notes;
      setNotebooks(nextNotebooks);
      setNotes(nextNotes);
      setSelection(null);

      // pathTo returns an empty set for anything not in the visible tree — a
      // page still on screen always has at least its notebook in the path.
      const stillVisible = selectedNoteId
        ? pathTo(buildTree({ notebooks: nextNotebooks, notes: nextNotes }), selectedNoteId).size > 0
        : true;
      if (!stillVisible) clearNote();
    } catch (e) { fail(e); }
  }, [notebooks, notes, selectedNoteId, clearNote, fail]);

  const bagItem = useCallback(
    (kind: TreeKind, id: string) => applyBagged(kind, [id], true), [applyBagged]);
  const unbagItem = useCallback(
    (kind: TreeKind, id: string) => applyBagged(kind, [id], false), [applyBagged]);
  const bagSelection = useCallback(async () => {
    if (!selection) return;
    await applyBagged(selection.kind, selection.ids, true);
  }, [selection, applyBagged]);

  const addNotebook = useCallback(async () => {
    try {
      const nb = await api.createNotebook();
      setNotebooks((xs) => [...xs, nb]);
    } catch (e) { fail(e); }
  }, [fail]);

  const renameNotebook = useCallback(async (id: string, title: string) => {
    try {
      const nb = await api.renameNotebook(id, title);
      setNotebooks((xs) => xs.map((x) => (x.id === id ? { ...x, title: nb.title } : x)));
    } catch (e) { fail(e); }
  }, [fail]);

  const removeNotebook = useCallback(async (id: string) => {
    try {
      await api.deleteNotebook(id);
      // If the open page lived in this notebook, clear the loaded content too.
      const hadSelected = notes.some((n) => n.notebook_id === id && n.id === selectedNoteId);
      setNotebooks((xs) => xs.filter((x) => x.id !== id));
      setNotes((xs) => xs.filter((x) => x.notebook_id !== id));
      if (hadSelected) clearNote();
    } catch (e) { fail(e); }
  }, [fail, notes, selectedNoteId, clearNote]);

  const addNote = useCallback(async (notebookId: string) => {
    try {
      const note = await api.createNote(notebookId);
      setNotes((xs) => [...xs, note]);
      selectNote(note.id);
    } catch (e) { fail(e); }
  }, [fail, selectNote]);

  const renameNote = useCallback(async (id: string, title: string) => {
    try {
      const note = await api.renameNote(id, title);
      setNotes((xs) => xs.map((n) => (n.id === id ? { ...n, title: note.title } : n)));
    } catch (e) { fail(e); }
  }, [fail]);

  const removeNote = useCallback(async (id: string) => {
    try {
      await api.deleteNote(id);
      setNotes((xs) => xs.filter((n) => n.id !== id));
      if (selectedNoteId === id) clearNote();
    } catch (e) { fail(e); }
  }, [fail, selectedNoteId, clearNote]);

  // ── Screenshots ────────────────────────────────────────────────────────────
  // Start a new screenshot slot. Also switches paste to "new", so the next
  // Ctrl+V does the same thing again.
  const addBucket = useCallback(async (file: File) => {
    if (!selectedNoteId) return;
    setUploading(true);
    try {
      const img = await api.uploadImage(selectedNoteId, file);
      setBuckets((xs) => [...xs, { ...img, parts: [] }]);
      setPasteMode("new");
      // Focus the new screenshot so its (empty) thread is ready to write into.
      selectBucket(img.id);
    } catch (e) { fail(e); }
    finally { setUploading(false); }
  }, [selectedNoteId, fail, selectBucket]);

  // Stack another snip under the open screenshot — the second half of a question
  // too tall to capture in one go. Paste follows suit until told otherwise.
  const addPart = useCallback(async (file: File) => {
    if (!selectedNoteId || !selectedBucketId) return;
    setUploading(true);
    try {
      const img = await api.uploadImage(selectedNoteId, file, selectedBucketId);
      setBuckets((xs) => xs.map((b) => (b.id === selectedBucketId ? { ...b, parts: [...b.parts, img] } : b)));
      setPasteMode("current");
    } catch (e) { fail(e); }
    finally { setUploading(false); }
  }, [selectedNoteId, selectedBucketId, fail]);

  // Paste/drop: repeat whichever the learner chose last. With no screenshot open
  // there's nothing to append to, so it can only start a new one.
  const addPasted = useCallback(async (file: File) => {
    if (pasteMode === "current" && selectedBucketId) return addPart(file);
    return addBucket(file);
  }, [pasteMode, selectedBucketId, addPart, addBucket]);

  const renameBucket = useCallback(async (id: string, title: string) => {
    try {
      const img = await api.renameImage(id, title);
      setBuckets((xs) => xs.map((x) => (x.id === id ? { ...x, title: img.title } : x)));
    } catch (e) { fail(e); }
  }, [fail]);

  const flagBucket = useCallback(async (id: string, flag: NoteImageFlag | null) => {
    try {
      const img = await api.setImageFlag(id, flag);
      setBuckets((xs) => xs.map((x) => (x.id === id ? { ...x, flag: img.flag } : x)));
    } catch (e) { fail(e); }
  }, [fail]);

  const removeBucket = useCallback(async (id: string) => {
    try {
      await api.deleteImage(id);
      // Deleting the row cascades its snips and its thread away server-side.
      // Re-point the selection to a neighbouring screenshot (or none) if we
      // removed the open one; the thread effect reloads for the new selection.
      const next = buckets.filter((x) => x.id !== id);
      setBuckets(next);
      if (selectedBucketId === id) {
        setSelectedBucketId(next[0]?.id ?? null);
        setMessages([]); // thread effect refetches for the new selection, if any
      }
    } catch (e) { fail(e); }
  }, [fail, buckets, selectedBucketId]);

  // Remove one snip, leaving the screenshot (and its thread) intact.
  const removePart = useCallback(async (id: string) => {
    try {
      await api.deleteImage(id);
      setBuckets((xs) => xs.map((b) => ({ ...b, parts: b.parts.filter((p) => p.id !== id) })));
    } catch (e) { fail(e); }
  }, [fail]);

  // Nudge a snip up or down the stack — a two-part capture pasted in the wrong
  // order otherwise reads as a question with its halves swapped.
  const movePart = useCallback(async (id: string, direction: -1 | 1) => {
    const bucket = buckets.find((b) => b.parts.some((p) => p.id === id));
    if (!bucket) return;
    const parts = [...bucket.parts];
    const from = parts.findIndex((p) => p.id === id);

    // Moving the first snip up means trading places with the bucket's own
    // slice. The server swaps the bytes (the bucket must stay the bucket — it
    // holds the thread), so locally we swap what each row displays.
    if (direction === -1 && from === 0) {
      const part = parts[0];
      const swapped: NoteImageBucket = {
        ...bucket,
        url: part.url, storage_path: part.storage_path, mime: part.mime,
        parts: parts.map((p, i) => (i === 0
          ? { ...p, url: bucket.url, storage_path: bucket.storage_path, mime: bucket.mime }
          : p)),
      };
      setBuckets((xs) => xs.map((b) => (b.id === bucket.id ? swapped : b)));
      try {
        await api.promoteImage(id);
      } catch (e) {
        setBuckets((xs) => xs.map((b) => (b.id === bucket.id ? bucket : b)));
        fail(e);
      }
      return;
    }

    const to = from + direction;
    if (to < 0 || to >= parts.length) return;
    [parts[from], parts[to]] = [parts[to], parts[from]];

    const changed = reindex(parts);
    if (changed.length === 0) return;
    const positions = new Map(changed.map((c) => [c.id, c.position]));
    const reordered = parts.map((p) => ({ ...p, position: positions.get(p.id) ?? p.position }));
    setBuckets((xs) => xs.map((b) => (b.id === bucket.id ? { ...b, parts: reordered } : b)));

    try {
      await Promise.all(changed.map((c) => api.moveImage(c.id, c.position)));
    } catch (e) {
      // Put the old order back rather than leaving the screen disagreeing with
      // the database about which half is on top.
      setBuckets((xs) => xs.map((b) => (b.id === bucket.id ? { ...b, parts: bucket.parts } : b)));
      fail(e);
    }
  }, [buckets, fail]);

  // ── This screenshot's thread ──────────────────────────────────────────────
  const saveThought = useCallback(async (content: string) => {
    if (!selectedBucketId) return;
    try {
      const msg = await api.postMessage(selectedBucketId, content);
      setMessages((xs) => [...xs, msg]);
      setSummary(null); // thread changed → the summary is now stale
    } catch (e) { fail(e); }
  }, [selectedBucketId, fail]);

  const runCoach = useCallback(async () => {
    if (!selectedBucketId) return;
    setCoaching(true);
    try {
      const msg = await api.coach(selectedBucketId);
      setMessages((xs) => [...xs, msg]);
      setSummary(null); // thread changed → the summary is now stale
    } catch (e) { fail(e); }
    finally { setCoaching(false); }
  }, [selectedBucketId, fail]);

  // Generate (or regenerate) the running summary of this screenshot's thread.
  const runSummary = useCallback(async () => {
    if (!selectedBucketId) return;
    setSummarizing(true);
    try {
      const text = await api.summarize(selectedBucketId);
      setSummary(text);
    } catch (e) { fail(e); }
    finally { setSummarizing(false); }
  }, [selectedBucketId, fail]);

  return {
    tree, selectedNote, buckets, selectedBucketId, selectedBucket, messages, summary,
    loadingTree, loadingImages, loadingThread, coaching, summarizing, uploading, pasteMode, error,
    selectNote, selectBucket, setPasteMode, clearError,
    selection, groupCheck, pendingRenameId, treeItems, moveRow,
    expanded, toggleExpand, expandNode,
    bagItem, unbagItem, bagSelection,
    toggleSelect, clearSelection, clearPendingRename, groupSelection, dissolveGroup,
    addNotebook, renameNotebook, removeNotebook,
    addNote, renameNote, removeNote,
    addBucket, addPart, addPasted, renameBucket, flagBucket, removeBucket, removePart, movePart,
    saveThought, runCoach, runSummary,
  };
}
