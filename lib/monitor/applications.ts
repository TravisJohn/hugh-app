// ── Monitor Applications — statuses, palette, chart and stats ───────────────
// Everything with a branch in it lives here: what the five statuses are, what
// colour each one gets, the order they stack in, how a status change becomes a
// row plus an event, and how the list rolls up into the four stat tiles.
//
// Pure: no React, no Supabase, no clock of its own — callers inject `now`.

import type {
  ApplicationStatus,
  MonitorApplication,
  MonitorApplicationEvent,
} from "@/types/monitor";

/**
 * The stack order, bottom to top — and it is a constraint, not a preference.
 *
 * This palette was validated for colour-blind separation as a stack, and it
 * passes **only in this order**: putting the green (offer) above the red
 * (rejected) drops deuteranope separation to ΔE 4.6, below the threshold, so
 * the two ends of the chart stop being distinguishable to a deutan reader.
 *
 * It also happens to read as outcome order — dead at the base, best on top —
 * which is why it looks like an aesthetic choice and gets "tidied". It is not.
 * `applications.test.ts` asserts this array literally; if that test fails,
 * the fix is to restore the order, not to update the test.
 */
export const STATUS_STACK: readonly ApplicationStatus[] = [
  "rejected", "applied", "screening", "interview", "offer",
] as const;

/** Validated hex per status. Same caveat as STATUS_STACK — these were measured. */
export const STATUS_COLOR: Record<ApplicationStatus, string> = {
  rejected:  "#e66767",
  applied:   "#3987e5",
  screening: "#d95926",
  interview: "#9085e9",
  offer:     "#199e70",
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  rejected:  "Rejected",
  applied:   "Applied",
  screening: "Screening",
  interview: "Interview",
  offer:     "Offer",
};

/**
 * A status is "live" while the application can still go somewhere. Rejected and
 * offer are both terminal — an offer is an ending too, and counting it as live
 * would inflate the number that is supposed to tell you how much is still in
 * play.
 */
export const LIVE_STATUSES: readonly ApplicationStatus[] = ["applied", "screening", "interview"] as const;

/** How far the daily chart looks back. Eight weeks, as drawn in the prototype. */
export const CHART_DAYS = 56;

export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return typeof v === "string" && v in STATUS_COLOR;
}

// ── Writing a status change ────────────────────────────────────────────────

/**
 * A status change is two writes: the application's current status, and a new
 * row in its history. They must never disagree, so they are built here from one
 * input and applied together by one route. Nothing else may write either.
 */
export interface StatusChange {
  patch: { status: ApplicationStatus; updated_at: string };
  event: {
    application_id: string;
    user_id:        string;
    status:         ApplicationStatus;
    note:           string | null;
    occurred_on:    string;
  };
}

export function statusChange(args: {
  applicationId: string;
  userId:        string;
  status:        ApplicationStatus;
  note?:         string | null;
  occurredOn:    string;
  now?:          Date;
}): StatusChange {
  const { applicationId, userId, status, note, occurredOn, now = new Date() } = args;
  const trimmed = typeof note === "string" ? note.trim().slice(0, 300) : "";
  return {
    patch: { status, updated_at: now.toISOString() },
    event: {
      application_id: applicationId,
      user_id:        userId,
      status,
      note:           trimmed.length > 0 ? trimmed : null,
      occurred_on:    occurredOn,
    },
  };
}

// ── The daily stacked chart ────────────────────────────────────────────────

export interface ChartColumn {
  /** YYYY-MM-DD, UTC. */
  date: string;
  /** Counts in STATUS_STACK order — index 0 is the bottom segment. */
  segments: number[];
  total: number;
}

/**
 * Applications sent per day, stacked by where each one stands **now**.
 *
 * The bar's position is the day it was sent; its colour is today's outcome. So
 * the chart is not a snapshot of the past — it is the past re-coloured by what
 * became of it, which is the view that tells you whether a good week actually
 * led anywhere.
 */
export function buildChart(
  applications: readonly MonitorApplication[],
  days = CHART_DAYS,
  now: Date = new Date(),
): ChartColumn[] {
  const byDate = new Map<string, number[]>();
  for (const app of applications) {
    const date = app.applied_on.slice(0, 10);
    const segs = byDate.get(date) ?? new Array<number>(STATUS_STACK.length).fill(0);
    const idx = STATUS_STACK.indexOf(app.status);
    // An unknown status is dropped rather than piled into segment 0, where it
    // would silently be counted as a rejection.
    if (idx >= 0) segs[idx] += 1;
    byDate.set(date, segs);
  }

  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: ChartColumn[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(todayUTC - i * 86_400_000).toISOString().slice(0, 10);
    const segments = byDate.get(date) ?? new Array<number>(STATUS_STACK.length).fill(0);
    out.push({ date, segments, total: segments.reduce((a, b) => a + b, 0) });
  }
  return out;
}

// ── The four stat tiles ────────────────────────────────────────────────────

export interface ApplicationStats {
  sent: number;
  /** Earliest applied_on, or null when nothing has been sent. */
  since: string | null;
  live: number;
  /** Applications that EVER reached interview or offer, not just those there now. */
  interviews: number;
  /** interviews as a share of sent, 0-100, rounded. */
  interviewRate: number;
  offers: number;
  /** Named only when exactly one — "Offers: 1, Halcyon Labs" beats a bare 1. */
  offerCompany: string | null;
}

/**
 * Roll the list up into the four tiles.
 *
 * `interviews` is counted from the **history**, not from current status. An
 * application that reached an interview and was then rejected still happened,
 * and burying it would make the one number that measures whether the applying
 * is working drop every time something went wrong afterwards. This is the whole
 * reason migration 039 exists.
 */
export function summariseApplications(
  applications: readonly MonitorApplication[],
  events: readonly MonitorApplicationEvent[],
): ApplicationStats {
  const sent = applications.length;

  let since: string | null = null;
  for (const a of applications) {
    if (!since || a.applied_on < since) since = a.applied_on;
  }

  const live = applications.filter(a => LIVE_STATUSES.includes(a.status)).length;

  const reached = new Set<string>();
  for (const e of events) {
    if (e.status === "interview" || e.status === "offer") reached.add(e.application_id);
  }
  // An application can hold a status it has no event for only if history is
  // incomplete; count it anyway rather than under-reporting.
  for (const a of applications) {
    if (a.status === "interview" || a.status === "offer") reached.add(a.id);
  }
  const interviews = reached.size;

  const offerList = applications.filter(a => a.status === "offer");

  return {
    sent,
    since,
    live,
    interviews,
    interviewRate: sent === 0 ? 0 : Math.round((interviews / sent) * 100),
    offers: offerList.length,
    offerCompany: offerList.length === 1 ? offerList[0].company : null,
  };
}

// ── Ordering and history ───────────────────────────────────────────────────

/**
 * Newest application first — the list is a queue of what you are waiting to
 * hear about, so the thing you sent this morning belongs at the top. Ties break
 * on creation order so the list never shuffles between renders.
 */
export function sortApplications(applications: readonly MonitorApplication[]): MonitorApplication[] {
  return applications.slice().sort((a, b) =>
    b.applied_on.localeCompare(a.applied_on) || b.created_at.localeCompare(a.created_at));
}

/** One application's history, oldest first — a timeline reads downward in time. */
export function historyFor(
  applicationId: string,
  events: readonly MonitorApplicationEvent[],
): MonitorApplicationEvent[] {
  return events
    .filter(e => e.application_id === applicationId)
    .sort((a, b) =>
      a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at));
}

/** Trim and cap a free-text field, or null. Shared by every document field. */
export function normaliseText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().slice(0, max);
  return text.length > 0 ? text : null;
}

/**
 * A link to the advert, or null.
 *
 * **http and https only, and that is a security rule rather than tidiness.**
 * This string is rendered as a clickable link, so accepting `javascript:` or
 * `data:` would let a pasted value execute when clicked. Anything that is not a
 * web address is refused rather than repaired.
 *
 * A bare "example.com/jobs/123" is given https:// rather than rejected, because
 * that is what people paste and refusing it teaches nothing.
 */
export function normaliseJobUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().slice(0, 2000);
  if (text.length === 0) return null;

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The bit of a link worth showing on screen: "boards.example.com". */
export function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Company and role are one line each in a list, not a paragraph. */
export const APP_LINE_MAX = 160;

/** A pasted job description or cover letter is long, but not unbounded. */
export const APP_DOC_MAX = 20_000;
