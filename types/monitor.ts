// ── Monitor (/monitor) — shared row shapes ──────────────────────────────────
// Monitor is a record, not a teacher: every field here is text the learner
// typed. Nothing in this file is ever sent to a model. See docs/monitor-prd.md.

/** Which view the shell is showing. Mirrored in the URL as ?view=. */
export type MonitorView = "skills" | "applications" | "documents" | "usage";

// Order follows the order you do things in: you write a CV before you apply
// with it, and you look at what worked afterwards.
export const MONITOR_VIEWS: readonly MonitorView[] =
  ["skills", "documents", "applications", "usage"] as const;

/**
 * The tab bar groups views; it does not mirror them one to one.
 *
 * Your résumés and your applications are one activity — a job search — so they
 * live under one tab with a sub-navigation, rather than as two peers you have to
 * know are related. The URL still names the VIEW (`?view=documents`), so every
 * link saved before the grouping still resolves, and the sub-navigation costs no
 * second parameter.
 */
export interface MonitorTab {
  id:    string;
  label: string;
  views: readonly MonitorView[];
}

export const MONITOR_TABS: readonly MonitorTab[] = [
  { id: "skills", label: "Skills",           views: ["skills"] },
  { id: "jobs",   label: "Job Applications", views: ["documents", "applications"] },
  { id: "usage",  label: "Your Usage",       views: ["usage"] },
] as const;

/** The sub-navigation label for a view, used when its tab holds more than one. */
export const VIEW_LABEL: Record<MonitorView, string> = {
  skills:       "Skills",
  documents:    "Résumés and Cover Letters",
  applications: "Applications",
  usage:        "Your Usage",
};

export function tabForView(view: MonitorView): MonitorTab {
  return MONITOR_TABS.find(t => t.views.includes(view)) ?? MONITOR_TABS[0];
}

export function isMonitorView(value: string | null | undefined): value is MonitorView {
  return !!value && (MONITOR_VIEWS as readonly string[]).includes(value);
}

/** A row of `monitor_skills`. Free text — no link to learning_goals, by design. */
export interface MonitorSkill {
  id:          string;
  user_id:     string;
  name:        string;
  created_at:  string;
  /** Soft delete. Non-null means archived: hidden from the list, never destroyed. */
  archived_at: string | null;
}

/**
 * A row of `monitor_skill_entries` — one session, not one day. Several entries
 * may share an `entry_date`; that is what gives the heatmap its shades.
 */
export interface MonitorSkillEntry {
  id:         string;
  skill_id:   string;
  user_id:    string;
  /** YYYY-MM-DD. A DATE column, so it carries no time and no timezone. */
  entry_date: string;
  note:       string | null;
  /**
   * How intensive this session was, 1 (subpar) to 5 (intensive). NULL for a
   * bare tick and for anything logged before migration 038 — read as 1 when
   * shading, never invented.
   */
  effort:     number | null;
  created_at: string;
}

/** What GET /api/monitor/skills returns: flat rows, joined client-side. */
export interface MonitorSkillsPayload {
  skills:  MonitorSkill[];
  entries: MonitorSkillEntry[];
}

// ── Applications ────────────────────────────────────────────────────────────

/**
 * The five stages. Closed by a CHECK in the database because these are not
 * merely labels: each one owns a validated colour, and the order they stack in
 * is load-bearing (see lib/monitor/applications.ts). A free-text status would
 * render as an uncoloured bar.
 */
export type ApplicationStatus = "applied" | "screening" | "interview" | "offer" | "rejected";

/** A row of `monitor_applications`. Everything here is typed in by hand. */
export interface MonitorApplication {
  id:              string;
  user_id:         string;
  company:         string;
  role_title:      string;
  /** The CURRENT stage. History lives in MonitorApplicationEvent. */
  status:          ApplicationStatus;
  applied_on:      string;
  /** Where it was posted. A pointer that rots; job_description is the archive. */
  job_url:         string | null;
  /** Belongs to this application alone; never reused, so never a document. */
  job_description: string | null;
  notes:           string | null;
  /** The version of a maintained document that was actually sent, if any. */
  resume_version_id:       string | null;
  cover_letter_version_id: string | null;
  created_at:      string;
  updated_at:      string;
}

/** One dated step in an application's history. Append-only. */
export interface MonitorApplicationEvent {
  id:             string;
  application_id: string;
  user_id:        string;
  status:         ApplicationStatus;
  note:           string | null;
  /** When it happened, which is often not when it was typed in. */
  occurred_on:    string;
  created_at:     string;
}

/** What GET /api/monitor/applications returns: flat rows, joined client-side. */
export interface MonitorApplicationsPayload {
  applications: MonitorApplication[];
  events:       MonitorApplicationEvent[];
}

// ── Documents ───────────────────────────────────────────────────────────────

/**
 * The two things you send more than once. Closed to two kinds because those are
 * exactly the two an application can reference — a third would only ever hold
 * rows nothing points at.
 */
export type DocumentKind = "resume" | "cover_letter";

/** A document you maintain — "Analytics Engineer CV". Versions hold the text. */
export interface MonitorDocument {
  id:          string;
  user_id:     string;
  kind:        DocumentKind;
  label:       string;
  created_at:  string;
  /** Soft delete: applications still point at its versions, so it must survive. */
  archived_at: string | null;
}

/**
 * One state of a document. Append-only in practice — you add v4, you do not
 * rewrite v3, because an application claims to have sent a particular version
 * and editing it would make that claim false.
 */
export interface MonitorDocumentVersion {
  id:          string;
  document_id: string;
  user_id:     string;
  version:     number;
  /** The text, searchable and readable inline. Null when only a file was kept. */
  content:     string | null;
  /** Storage object path. Null when this version is text only. */
  file_path:   string | null;
  /** The name as uploaded — often how you remember which version it was. */
  file_name:   string | null;
  file_size:   number | null;
  mime:        string | null;
  /** Why this version exists: "trimmed to one page, led with dbt". */
  note:        string | null;
  created_at:  string;
}

/** What GET /api/monitor/documents returns: flat rows, joined client-side. */
export interface MonitorDocumentsPayload {
  documents: MonitorDocument[];
  versions:  MonitorDocumentVersion[];
}

// ── Usage ───────────────────────────────────────────────────────────────────

/**
 * A row of `activity_events`: one learner, one surface, one day.
 *
 * `hits` counts how many times that surface was opened that day, but the row
 * exists at all because the surface was used once. The grid answers "did I show
 * up"; `hits` only gives the ramp gradation.
 */
export interface ActivityEvent {
  feature:    string;
  /** YYYY-MM-DD, UTC. Decided server-side, never by the browser's clock. */
  event_date: string;
  hits:       number;
}
