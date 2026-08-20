"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { summariseSkills, archivedSkills, resolveTick, type SkillSummary } from "@/lib/monitor/skills";
import {
  sortApplications, summariseApplications, buildChart, historyFor,
  type ApplicationStats, type ChartColumn,
} from "@/lib/monitor/applications";
import {
  usageByFeature, combinedUsage, rankByDaysUsed, surfacesTouched,
  type FeatureUsage,
} from "@/lib/monitor/usage";
import type { HeatmapDay } from "@/lib/calendar";
import {
  isMonitorView,
  type ApplicationStatus, type MonitorApplication, type MonitorApplicationEvent,
  type MonitorApplicationsPayload, type MonitorSkill, type MonitorSkillEntry, type MonitorView,
  type DocumentKind, type MonitorDocument, type MonitorDocumentVersion,
  type MonitorDocumentsPayload, type ActivityEvent,
} from "@/types/monitor";

// Monitor's state, in one place. The shell and its views take everything by
// props and never fetch on their own (Architecture Rule 2) — otherwise a tick
// in the right-hand pane and the heatmap on the left would each hold their own
// idea of what has been logged today.

/**
 * The active tab, mirrored in the URL as ?view=. Keeping it in the URL rather
 * than in component state is what makes the back button, a refresh and a
 * bookmarked link all land where the learner expects — the reason tabs were
 * chosen over three routes without giving up addressability.
 */
export function useMonitorView(): [MonitorView, (v: MonitorView) => void] {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("view");
  const view: MonitorView = isMonitorView(raw) ? raw : "skills";

  const setView = useCallback((next: MonitorView) => {
    const q = new URLSearchParams(params.toString());
    q.set("view", next);
    // replace, not push: flipping between tabs shouldn't stack history entries
    // the learner then has to press back through to leave Monitor.
    router.replace(`/monitor?${q.toString()}`, { scroll: false });
  }, [router, params]);

  return [view, setView];
}

export interface MonitorSkillsState {
  summaries:  SkillSummary[];
  /** Put down, not destroyed — listed so an archived skill stays reachable. */
  archived:   MonitorSkill[];
  selected:   SkillSummary | null;
  loading:    boolean;
  /** Non-null when the last action failed. Shown, never swallowed. */
  error:      string | null;
  busy:       boolean;
  select:     (skillId: string) => void;
  addSkill:   (name: string) => Promise<void>;
  archive:    (skillId: string) => Promise<void>;
  restore:    (skillId: string) => Promise<void>;
  logEntry:   (skillId: string, note: string, effort: number | null) => Promise<void>;
  removeEntry:(skillId: string, entryId: string) => Promise<void>;
  /**
   * Set how hard today was, from the Today picker — replacing that skill's bare
   * tick rather than stacking another one, and clearing the day when the
   * rating already showing is clicked again. See resolveTick for why.
   */
  setTodaysEffort: (skillId: string, effort: number) => Promise<void>;
  /** Re-rate one entry from the diary, or null to drop it back to a bare tick. */
  setEntryEffort: (skillId: string, entryId: string, effort: number | null) => Promise<void>;
  dismissError: () => void;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

// The three entry requests, each throwing a message worth showing. Kept apart
// from the callbacks below because setTodaysEffort composes two of them in one
// action, and duplicating the fetch there is how the two paths start to drift.

async function postEntry(
  skillId: string, note: string, effort: number | null,
): Promise<MonitorSkillEntry> {
  const res = await fetch(`/api/monitor/skills/${skillId}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note, effort }),
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't log that."));
  const { entry } = await res.json() as { entry: MonitorSkillEntry };
  return entry;
}

async function deleteEntry(skillId: string, entryId: string): Promise<void> {
  const res = await fetch(`/api/monitor/skills/${skillId}/entries?entryId=${entryId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't remove that entry."));
}

async function patchEntryEffort(
  skillId: string, entryId: string, effort: number | null,
): Promise<MonitorSkillEntry> {
  const res = await fetch(`/api/monitor/skills/${skillId}/entries?entryId=${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ effort }),
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't change that rating."));
  const { entry } = await res.json() as { entry: MonitorSkillEntry };
  return entry;
}

export function useMonitorSkills(): MonitorSkillsState {
  const [skills,  setSkills]  = useState<MonitorSkill[]>([]);
  const [entries, setEntries] = useState<MonitorSkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/monitor/skills");
        if (!res.ok) throw new Error(await readError(res, "Couldn't load your skills."));
        const data = await res.json() as { skills: MonitorSkill[]; entries: MonitorSkillEntry[] };
        if (cancelled) return;
        setSkills(data.skills);
        setEntries(data.entries);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load your skills.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const summaries = useMemo(() => summariseSkills(skills, entries), [skills, entries]);
  const archived  = useMemo(() => archivedSkills(skills), [skills]);

  // Keep a selection alive without fighting the learner: fall back to the first
  // skill when nothing is chosen or the chosen one was just archived, but never
  // move a selection they made themselves.
  const selected = useMemo(() => {
    return summaries.find(s => s.skill.id === selectedId) ?? summaries[0] ?? null;
  }, [summaries, selectedId]);

  const addSkill = useCallback(async (rawName: string) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/monitor/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: rawName }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't add that skill."));
      const { skill, existing } = await res.json() as { skill: MonitorSkill; existing: boolean };
      // `existing` means the server matched a skill already tracked (possibly
      // archived and revived). Replace rather than append, so a revived skill
      // doesn't appear twice.
      setSkills(prev => existing ? prev.map(s => s.id === skill.id ? skill : s) : [...prev, skill]);
      setSelectedId(skill.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that skill.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Archive and restore are the same write with the flag flipped, so they share
  // one path — two copies would be where the pair drifts apart.
  const setArchived = useCallback(async (skillId: string, archivedNext: boolean) => {
    const verb = archivedNext ? "archive" : "restore";
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/monitor/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: skillId, archived: archivedNext }),
      });
      if (!res.ok) throw new Error(await readError(res, `Couldn't ${verb} that skill.`));
      const { skill } = await res.json() as { skill: MonitorSkill };
      setSkills(prev => prev.map(s => s.id === skill.id ? skill : s));
      // Archiving the selected skill clears the selection so the diary doesn't
      // keep composing against something no longer in the list; restoring one
      // selects it, because bringing it back is a request to look at it.
      if (archivedNext) { if (selectedId === skillId) setSelectedId(null); }
      else setSelectedId(skillId);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Couldn't ${verb} that skill.`);
    } finally {
      setBusy(false);
    }
  }, [selectedId]);

  const archive = useCallback((skillId: string) => setArchived(skillId, true), [setArchived]);
  const restore = useCallback((skillId: string) => setArchived(skillId, false), [setArchived]);

  const logEntry = useCallback(async (skillId: string, note: string, effort: number | null) => {
    setBusy(true); setError(null);
    try {
      const entry = await postEntry(skillId, note, effort);
      setEntries(prev => [entry, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that.");
    } finally {
      setBusy(false);
    }
  }, []);

  const removeEntry = useCallback(async (skillId: string, entryId: string) => {
    setBusy(true); setError(null);
    try {
      await deleteEntry(skillId, entryId);
      setEntries(prev => prev.filter(e => e.id !== entryId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that entry.");
    } finally {
      setBusy(false);
    }
  }, []);

  const setTodaysEffort = useCallback(async (skillId: string, effort: number) => {
    const summary = summaries.find(s => s.skill.id === skillId);
    if (!summary) return;
    const action = resolveTick(summary, effort);

    setBusy(true); setError(null);
    try {
      if (action.kind !== "create") {
        // Deleted before the replacement goes in, and applied to local state as
        // each one lands: if the insert then fails, the day reads as untouched
        // rather than as still carrying the rating the learner just rejected.
        for (const id of action.removeIds) {
          await deleteEntry(skillId, id);
          setEntries(prev => prev.filter(e => e.id !== id));
        }
      }
      if (action.kind !== "clear") {
        const entry = await postEntry(skillId, "", action.effort);
        setEntries(prev => [entry, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that.");
    } finally {
      setBusy(false);
    }
  }, [summaries]);

  const setEntryEffort = useCallback(async (
    skillId: string, entryId: string, effort: number | null,
  ) => {
    setBusy(true); setError(null);
    try {
      const updated = await patchEntryEffort(skillId, entryId, effort);
      setEntries(prev => prev.map(e => (e.id === entryId ? updated : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change that rating.");
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    summaries,
    archived,
    selected,
    loading,
    error,
    busy,
    select: setSelectedId,
    addSkill,
    archive,
    restore,
    logEntry,
    removeEntry,
    setTodaysEffort,
    setEntryEffort,
    dismissError: () => setError(null),
  };
}

// ── Applications ────────────────────────────────────────────────────────────

export interface NewApplication {
  company:          string;
  role_title:       string;
  applied_on?:      string;
  job_url?:         string;
  job_description?: string;
  cover_letter?:    string;
  resume_text?:     string;
  notes?:           string;
}

export interface MonitorApplicationsState {
  applications: MonitorApplication[];
  events:       MonitorApplicationEvent[];
  stats:        ApplicationStats;
  chart:        ChartColumn[];
  selected:     MonitorApplication | null;
  /** The selected application's history, oldest first. */
  history:      MonitorApplicationEvent[];
  loading:      boolean;
  error:        string | null;
  busy:         boolean;
  select:       (id: string | null) => void;
  create:       (input: NewApplication) => Promise<void>;
  updateFields: (id: string, patch: Partial<NewApplication>) => Promise<void>;
  setStatus:    (id: string, status: ApplicationStatus, note: string, occurredOn?: string) => Promise<void>;
  /** Point an application at the document version it was sent, or clear it. */
  attach:       (id: string, kind: DocumentKind, versionId: string | null) => Promise<void>;
  remove:       (id: string) => Promise<void>;
  dismissError: () => void;
}

/**
 * Owns the Applications tab. Selection lives in the URL as ?app=<id> so a
 * particular application can be linked to and survives a refresh — the same
 * reason the tab itself is a search param rather than component state.
 */
export function useMonitorApplications(): MonitorApplicationsState {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("app");

  const [applications, setApplications] = useState<MonitorApplication[]>([]);
  const [events,       setEvents]       = useState<MonitorApplicationEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/monitor/applications");
        if (!res.ok) throw new Error(await readError(res, "Couldn't load your applications."));
        const data = await res.json() as MonitorApplicationsPayload;
        if (cancelled) return;
        setApplications(data.applications);
        setEvents(data.events);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load your applications.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => sortApplications(applications), [applications]);
  const stats  = useMemo(() => summariseApplications(applications, events), [applications, events]);
  const chart  = useMemo(() => buildChart(applications), [applications]);

  const selected = useMemo(
    () => sorted.find(a => a.id === selectedId) ?? sorted[0] ?? null,
    [sorted, selectedId],
  );

  const history = useMemo(
    () => selected ? historyFor(selected.id, events) : [],
    [selected, events],
  );

  const select = useCallback((id: string | null) => {
    const q = new URLSearchParams(params.toString());
    q.set("view", "applications");
    if (id) q.set("app", id); else q.delete("app");
    router.replace(`/monitor?${q.toString()}`, { scroll: false });
  }, [router, params]);

  const create = useCallback(async (input: NewApplication) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/monitor/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't save that application."));
      const { application, event } = await res.json() as
        { application: MonitorApplication; event: MonitorApplicationEvent | null };
      setApplications(prev => [application, ...prev]);
      if (event) setEvents(prev => [...prev, event]);
      select(application.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that application.");
    } finally {
      setBusy(false);
    }
  }, [select]);

  const patchApplication = useCallback(async (
    id: string,
    body: Record<string, unknown>,
    fallback: string,
  ) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/monitor/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, fallback));
      const { application, event } = await res.json() as
        { application: MonitorApplication; event: MonitorApplicationEvent | null };
      setApplications(prev => prev.map(a => a.id === application.id ? application : a));
      if (event) setEvents(prev => [...prev, event]);
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateFields = useCallback(
    (id: string, patch: Partial<NewApplication>) =>
      patchApplication(id, patch, "Couldn't save that change."),
    [patchApplication],
  );

  const setStatus = useCallback(
    (id: string, status: ApplicationStatus, note: string, occurredOn?: string) =>
      patchApplication(
        id,
        { status, status_note: note, ...(occurredOn ? { occurred_on: occurredOn } : {}) },
        "Couldn't update that status.",
      ),
    [patchApplication],
  );

  const attach = useCallback(
    (id: string, kind: DocumentKind, versionId: string | null) =>
      patchApplication(
        id,
        { [kind === "resume" ? "resume_version_id" : "cover_letter_version_id"]: versionId },
        "Couldn't attach that document.",
      ),
    [patchApplication],
  );

  const remove = useCallback(async (id: string) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/monitor/applications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Couldn't remove that application."));
      setApplications(prev => prev.filter(a => a.id !== id));
      // Its history goes with it in the database (ON DELETE CASCADE); drop it
      // here too so the stats don't keep counting a deleted application.
      setEvents(prev => prev.filter(e => e.application_id !== id));
      if (selectedId === id) select(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that application.");
    } finally {
      setBusy(false);
    }
  }, [selectedId, select]);

  return {
    applications: sorted,
    events,
    stats,
    chart,
    selected,
    history,
    loading,
    error,
    busy,
    select,
    create,
    updateFields,
    setStatus,
    attach,
    remove,
    dismissError: () => setError(null),
  };
}

// ── Documents ───────────────────────────────────────────────────────────────

/**
 * What a new version carries: the text, the artifact, or both. At least one of
 * `content` and `file` must be present — an empty version would be a claim
 * about what you sent with nothing behind it.
 */
export interface VersionBody {
  content: string;
  note:    string;
  file:    File | null;
}

/**
 * One request body for a version, in whichever encoding it needs.
 *
 * Multipart only when there is a file: JSON is cheaper and easier to read in a
 * network log, and most versions are text. Same endpoint either way — the
 * encoding is a detail of the browser, not a second feature.
 */
function versionRequest(body: VersionBody, extra: Record<string, string> = {}): RequestInit {
  if (!body.file) {
    return {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ content: body.content, note: body.note, ...extra }),
    };
  }
  const form = new FormData();
  form.set("content", body.content);
  form.set("note", body.note);
  form.set("file", body.file);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  // No Content-Type header: the browser must set it itself, with the multipart
  // boundary. Setting it by hand produces a body the server cannot parse.
  return { method: "POST", body: form };
}

export interface MonitorDocumentsState {
  documents: MonitorDocument[];
  versions:  MonitorDocumentVersion[];
  /** The document open in the Documents tab, from ?doc= in the URL. */
  selected:  MonitorDocument | null;
  select:    (documentId: string | null) => void;
  loading:   boolean;
  error:     string | null;
  busy:      boolean;
  createDocument: (kind: DocumentKind, label: string, body: VersionBody) => Promise<MonitorDocumentVersion | null>;
  addVersion:     (documentId: string, body: VersionBody) => Promise<MonitorDocumentVersion | null>;
  rename:         (documentId: string, label: string) => Promise<void>;
  setArchived:    (documentId: string, archived: boolean) => Promise<void>;
  dismissError:   () => void;
}

/**
 * The document library — the résumés and cover letters you maintain.
 *
 * Kept as its own hook rather than folded into applications: the library
 * outlives any one application, and both the attachment picker in the detail
 * pane and the outcome panel on the left read the same rows. One fetch, one
 * copy in memory.
 *
 * `createDocument` and `addVersion` return the new version so the caller can
 * attach it in the same gesture — pasting a cover letter into an application
 * should file it and attach it, not file it and then ask you to go and find it.
 */
export function useMonitorDocuments(): MonitorDocumentsState {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("doc");

  const [documents, setDocuments] = useState<MonitorDocument[]>([]);
  const [versions,  setVersions]  = useState<MonitorDocumentVersion[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/monitor/documents");
        if (!res.ok) throw new Error(await readError(res, "Couldn't load your documents."));
        const data = await res.json() as MonitorDocumentsPayload;
        if (cancelled) return;
        setDocuments(data.documents);
        setVersions(data.versions);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load your documents.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const createDocument = useCallback(async (
    kind: DocumentKind, label: string, body: VersionBody,
  ): Promise<MonitorDocumentVersion | null> => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/monitor/documents", versionRequest(body, { kind, label }));
      if (!res.ok) throw new Error(await readError(res, "Couldn't save that document."));
      const { document, version, existing } = await res.json() as
        { document: MonitorDocument; version: MonitorDocumentVersion; existing: boolean };
      // `existing` means the server folded this into a document already held:
      // the same name is the same document, and it gained a version rather than
      // spawning a twin. Replace rather than append, or the library shows it
      // twice until the next reload.
      setDocuments(prev => existing
        ? prev.map(d => d.id === document.id ? document : d)
        : [document, ...prev]);
      setVersions(prev => [version, ...prev]);
      return version;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that document.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const addVersion = useCallback(async (
    documentId: string, body: VersionBody,
  ): Promise<MonitorDocumentVersion | null> => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(
        `/api/monitor/documents/${documentId}/versions`,
        versionRequest(body),
      );
      if (!res.ok) throw new Error(await readError(res, "Couldn't save that version."));
      const { version } = await res.json() as { version: MonitorDocumentVersion };
      setVersions(prev => [version, ...prev]);
      return version;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that version.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const patchDocument = useCallback(async (
    body: Record<string, unknown>, fallback: string,
  ) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/monitor/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, fallback));
      const { document } = await res.json() as { document: MonitorDocument };
      setDocuments(prev => prev.map(d => d.id === document.id ? document : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }, []);

  // Falls back to the first live document so the pane is never empty while the
  // library has something in it, but never overrides a choice already made.
  const live = documents.filter(d => d.archived_at === null);
  const selected = live.find(d => d.id === selectedId) ?? live[0] ?? null;

  const select = useCallback((documentId: string | null) => {
    const q = new URLSearchParams(params.toString());
    q.set("view", "documents");
    if (documentId) q.set("doc", documentId); else q.delete("doc");
    router.replace(`/monitor?${q.toString()}`, { scroll: false });
  }, [router, params]);

  return {
    documents,
    versions,
    selected,
    select,
    loading,
    error,
    busy,
    createDocument,
    addVersion,
    rename:      (id, label)      => patchDocument({ id, label }, "Couldn't rename that document."),
    setArchived: (id, archived)   => patchDocument({ id, archived }, "Couldn't archive that document."),
    dismissError: () => setError(null),
  };
}

// ── Usage ───────────────────────────────────────────────────────────────────

export interface MonitorUsageState {
  perFeature: FeatureUsage[];
  combined:   HeatmapDay[];
  ranked:     FeatureUsage[];
  touched:    number;
  loading:    boolean;
  error:      string | null;
}

/**
 * The only Monitor view the learner does not fill in.
 *
 * Read-only by design: there is nothing to write here, because writing happens
 * on the surfaces themselves through `RecordActivity`. A hook with no actions
 * is the shape of a view whose data is a consequence rather than an input.
 */
export function useMonitorUsage(): MonitorUsageState {
  const [events,  setEvents]  = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/monitor/activity");
        if (!res.ok) throw new Error(await readError(res, "Couldn't load your usage."));
        const data = await res.json() as { events: ActivityEvent[] };
        if (!cancelled) setEvents(data.events);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load your usage.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const perFeature = useMemo(() => usageByFeature(events), [events]);
  const combined   = useMemo(() => combinedUsage(perFeature), [perFeature]);
  const ranked     = useMemo(() => rankByDaysUsed(perFeature), [perFeature]);
  const touched    = useMemo(() => surfacesTouched(perFeature), [perFeature]);

  return { perFeature, combined, ranked, touched, loading, error };
}
