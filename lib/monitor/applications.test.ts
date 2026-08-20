import { describe, it, expect } from "vitest";
import {
  STATUS_STACK,
  STATUS_COLOR,
  LIVE_STATUSES,
  isApplicationStatus,
  statusChange,
  buildChart,
  summariseApplications,
  sortApplications,
  historyFor,
  normaliseText,
  normaliseJobUrl,
  urlHost,
  CHART_DAYS,
} from "./applications";
import type { MonitorApplication, MonitorApplicationEvent } from "@/types/monitor";

const NOW = new Date("2026-06-17T12:00:00.000Z");

function app(over: Partial<MonitorApplication> = {}): MonitorApplication {
  return {
    id: "a1",
    user_id: "u1",
    company: "Halcyon Labs",
    role_title: "Senior Analytics Engineer",
    status: "applied",
    applied_on: "2026-06-17",
    job_url: null,
    job_description: null,
    notes: null,
    resume_version_id: null,
    cover_letter_version_id: null,
    created_at: "2026-06-17T09:00:00.000Z",
    updated_at: "2026-06-17T09:00:00.000Z",
    ...over,
  };
}

function ev(over: Partial<MonitorApplicationEvent> = {}): MonitorApplicationEvent {
  return {
    id: "e1",
    application_id: "a1",
    user_id: "u1",
    status: "applied",
    note: null,
    occurred_on: "2026-06-17",
    created_at: "2026-06-17T09:00:00.000Z",
    ...over,
  };
}

// ── The constraint that is easiest to break by tidying ──────────────────────

describe("STATUS_STACK — the validated order", () => {
  it("stacks rejected, applied, screening, interview, offer — in exactly that order", () => {
    // THIS IS NOT A STYLE CHOICE. The palette passes colour-blind separation
    // only in this stacking order: green (offer) directly above red (rejected)
    // drops deuteranope separation to dE 4.6, below threshold, and the two ends
    // of the chart stop being distinguishable.
    //
    // If this test fails, restore the order. Do not update the expectation.
    expect(STATUS_STACK).toEqual(["rejected", "applied", "screening", "interview", "offer"]);
  });

  it("assigns each status its measured colour", () => {
    expect(STATUS_COLOR).toEqual({
      rejected:  "#e66767",
      applied:   "#3987e5",
      screening: "#d95926",
      interview: "#9085e9",
      offer:     "#199e70",
    });
  });

  it("covers every status exactly once, so no bar can be uncoloured", () => {
    expect(new Set(STATUS_STACK).size).toBe(STATUS_STACK.length);
    expect(STATUS_STACK.every(s => s in STATUS_COLOR)).toBe(true);
    expect(Object.keys(STATUS_COLOR)).toHaveLength(STATUS_STACK.length);
  });

  it("treats offer as closed, not live", () => {
    // An offer is an ending too. Counting it as live would inflate the number
    // that is meant to say how much is still in play.
    expect(LIVE_STATUSES).toEqual(["applied", "screening", "interview"]);
    expect(LIVE_STATUSES).not.toContain("offer");
    expect(LIVE_STATUSES).not.toContain("rejected");
  });
});

describe("isApplicationStatus", () => {
  it("accepts the five statuses and nothing else", () => {
    for (const s of STATUS_STACK) expect(isApplicationStatus(s)).toBe(true);
    expect(isApplicationStatus("ghosted")).toBe(false);
    expect(isApplicationStatus("")).toBe(false);
    expect(isApplicationStatus(3)).toBe(false);
    expect(isApplicationStatus(null)).toBe(false);
  });
});

describe("statusChange", () => {
  it("builds the column update and the history row from one input", () => {
    // The two must never disagree, which is why nothing constructs them
    // separately.
    const { patch, event } = statusChange({
      applicationId: "a1", userId: "u1", status: "interview",
      note: "SQL pairing", occurredOn: "2026-06-15", now: NOW,
    });
    expect(patch.status).toBe("interview");
    expect(event.status).toBe("interview");
    expect(event.application_id).toBe("a1");
    expect(event.occurred_on).toBe("2026-06-15");
    expect(event.note).toBe("SQL pairing");
  });

  it("stamps updated_at from the injected clock", () => {
    expect(statusChange({
      applicationId: "a1", userId: "u1", status: "offer",
      occurredOn: "2026-06-17", now: NOW,
    }).patch.updated_at).toBe(NOW.toISOString());
  });

  it("records the day it happened, not the day it was typed", () => {
    // You often record on Thursday that the rejection landed on Tuesday.
    const { event } = statusChange({
      applicationId: "a1", userId: "u1", status: "rejected",
      occurredOn: "2026-06-09", now: NOW,
    });
    expect(event.occurred_on).toBe("2026-06-09");
  });

  it("turns an empty or missing note into null", () => {
    expect(statusChange({ applicationId: "a1", userId: "u1", status: "applied", occurredOn: "2026-06-17" }).event.note).toBeNull();
    expect(statusChange({ applicationId: "a1", userId: "u1", status: "applied", note: "   ", occurredOn: "2026-06-17" }).event.note).toBeNull();
  });
});

describe("buildChart", () => {
  it("returns one column per day, oldest first, ending today", () => {
    const cols = buildChart([], CHART_DAYS, NOW);
    expect(cols).toHaveLength(CHART_DAYS);
    expect(cols[cols.length - 1].date).toBe("2026-06-17");
  });

  it("places a bar on the day it was sent and colours it by where it stands now", () => {
    // The chart is the past re-coloured by what became of it — that is what
    // tells you whether a good week actually led anywhere.
    const cols = buildChart([app({ applied_on: "2026-06-17", status: "offer" })], 7, NOW);
    const today = cols[cols.length - 1];
    expect(today.total).toBe(1);
    expect(today.segments[STATUS_STACK.indexOf("offer")]).toBe(1);
    expect(today.segments[STATUS_STACK.indexOf("applied")]).toBe(0);
  });

  it("stacks several applications from one day into their own segments", () => {
    const cols = buildChart([
      app({ id: "1", applied_on: "2026-06-16", status: "rejected" }),
      app({ id: "2", applied_on: "2026-06-16", status: "rejected" }),
      app({ id: "3", applied_on: "2026-06-16", status: "interview" }),
    ], 7, NOW);
    const day = cols[cols.length - 2];
    expect(day.total).toBe(3);
    expect(day.segments[STATUS_STACK.indexOf("rejected")]).toBe(2);
    expect(day.segments[STATUS_STACK.indexOf("interview")]).toBe(1);
  });

  it("emits segments in stack order, so index 0 is always the bottom of the bar", () => {
    const cols = buildChart([app({ status: "rejected" })], 7, NOW);
    expect(cols[cols.length - 1].segments[0]).toBe(1);
  });

  it("drops an unknown status rather than counting it as a rejection", () => {
    // Segment 0 is rejected. Piling unrecognised rows there would invent bad
    // news out of a data error.
    const cols = buildChart(
      [app({ status: "ghosted" as MonitorApplication["status"] })], 7, NOW);
    expect(cols[cols.length - 1].total).toBe(0);
  });

  it("drops applications older than the window", () => {
    const cols = buildChart([app({ applied_on: "2024-01-01" })], 7, NOW);
    expect(cols.every(c => c.total === 0)).toBe(true);
  });
});

describe("summariseApplications", () => {
  it("is all zeroes, and names no date, when nothing has been sent", () => {
    const s = summariseApplications([], []);
    expect(s).toMatchObject({ sent: 0, live: 0, interviews: 0, interviewRate: 0, offers: 0 });
    expect(s.since).toBeNull();
    expect(s.offerCompany).toBeNull();
  });

  it("dates the run from the earliest application", () => {
    expect(summariseApplications([
      app({ id: "1", applied_on: "2026-05-02" }),
      app({ id: "2", applied_on: "2026-03-11" }),
    ], []).since).toBe("2026-03-11");
  });

  it("counts live as the ones still in play", () => {
    const s = summariseApplications([
      app({ id: "1", status: "applied" }),
      app({ id: "2", status: "screening" }),
      app({ id: "3", status: "interview" }),
      app({ id: "4", status: "rejected" }),
      app({ id: "5", status: "offer" }),
    ], []);
    expect(s.live).toBe(3);
  });

  it("counts an interview that later became a rejection", () => {
    // THE reason migration 039 exists. Counting only current status would make
    // the number that measures whether applying is working fall every time
    // something went wrong afterwards.
    const s = summariseApplications(
      [app({ id: "a1", status: "rejected" })],
      [ev({ application_id: "a1", status: "applied" }),
       ev({ id: "e2", application_id: "a1", status: "interview" }),
       ev({ id: "e3", application_id: "a1", status: "rejected" })],
    );
    expect(s.interviews).toBe(1);
  });

  it("counts an application once however many interview events it has", () => {
    const s = summariseApplications([app({ id: "a1", status: "interview" })], [
      ev({ id: "e1", application_id: "a1", status: "interview" }),
      ev({ id: "e2", application_id: "a1", status: "interview" }),
    ]);
    expect(s.interviews).toBe(1);
  });

  it("still counts an application whose history is missing", () => {
    // History can be incomplete; under-reporting would be worse than trusting
    // the status the row already holds.
    expect(summariseApplications([app({ id: "a1", status: "interview" })], []).interviews).toBe(1);
  });

  it("reports the interview rate as a whole percent of sent", () => {
    const apps = Array.from({ length: 8 }, (_, i) => app({ id: `a${i}`, status: "applied" }));
    apps[0] = app({ id: "a0", status: "interview" });
    expect(summariseApplications(apps, []).interviewRate).toBe(13); // 1/8 = 12.5%
  });

  it("names the company when there is exactly one offer, and not when there are two", () => {
    expect(summariseApplications([app({ id: "1", status: "offer", company: "Halcyon Labs" })], []).offerCompany)
      .toBe("Halcyon Labs");
    expect(summariseApplications([
      app({ id: "1", status: "offer", company: "Halcyon Labs" }),
      app({ id: "2", status: "offer", company: "Kestrel" }),
    ], []).offerCompany).toBeNull();
  });
});

describe("sortApplications", () => {
  it("puts the most recently sent first — the list is a queue of what you await", () => {
    const out = sortApplications([
      app({ id: "old", applied_on: "2026-05-01" }),
      app({ id: "new", applied_on: "2026-06-16" }),
      app({ id: "mid", applied_on: "2026-06-01" }),
    ]);
    expect(out.map(a => a.id)).toEqual(["new", "mid", "old"]);
  });

  it("breaks a same-day tie on creation order so the list never shuffles", () => {
    const out = sortApplications([
      app({ id: "first",  applied_on: "2026-06-16", created_at: "2026-06-16T08:00:00.000Z" }),
      app({ id: "second", applied_on: "2026-06-16", created_at: "2026-06-16T18:00:00.000Z" }),
    ]);
    expect(out.map(a => a.id)).toEqual(["second", "first"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [app({ id: "a" }), app({ id: "b", applied_on: "2026-06-01" })];
    const copy = [...input];
    sortApplications(input);
    expect(input).toEqual(copy);
  });
});

describe("historyFor", () => {
  it("returns one application's events, oldest first — a timeline reads downward", () => {
    const out = historyFor("a1", [
      ev({ id: "3", application_id: "a1", status: "offer",     occurred_on: "2026-06-16" }),
      ev({ id: "1", application_id: "a1", status: "applied",   occurred_on: "2026-06-01" }),
      ev({ id: "2", application_id: "a1", status: "interview", occurred_on: "2026-06-10" }),
    ]);
    expect(out.map(e => e.id)).toEqual(["1", "2", "3"]);
  });

  it("ignores other applications' events", () => {
    const out = historyFor("a1", [ev({ application_id: "a1" }), ev({ id: "x", application_id: "a2" })]);
    expect(out).toHaveLength(1);
  });

  it("breaks a same-day tie on when it was recorded", () => {
    const out = historyFor("a1", [
      ev({ id: "late",  occurred_on: "2026-06-10", created_at: "2026-06-11T10:00:00.000Z" }),
      ev({ id: "early", occurred_on: "2026-06-10", created_at: "2026-06-10T10:00:00.000Z" }),
    ]);
    expect(out.map(e => e.id)).toEqual(["early", "late"]);
  });
});

describe("normaliseText", () => {
  it("trims, and turns empty into null", () => {
    expect(normaliseText("  hello  ", 100)).toBe("hello");
    expect(normaliseText("   ", 100)).toBeNull();
    expect(normaliseText("", 100)).toBeNull();
  });

  it("caps rather than rejecting, so a long paste is still saved", () => {
    expect(normaliseText("x".repeat(500), 100)).toHaveLength(100);
  });

  it("rejects non-strings from an untrusted body", () => {
    expect(normaliseText(undefined, 100)).toBeNull();
    expect(normaliseText(42, 100)).toBeNull();
  });
});

describe("normaliseJobUrl", () => {
  it("keeps a normal posting link", () => {
    expect(normaliseJobUrl("https://boards.example.com/jobs/123"))
      .toBe("https://boards.example.com/jobs/123");
  });

  it("assumes https for a bare host, because that is what people paste", () => {
    expect(normaliseJobUrl("example.com/jobs/123")).toBe("https://example.com/jobs/123");
  });

  it("refuses a javascript: URL", () => {
    // This value is rendered as a clickable link. Accepting a script scheme
    // would let pasted text execute on click — this is a security rule, not
    // tidiness.
    expect(normaliseJobUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseJobUrl("JavaScript:alert(1)")).toBeNull();
  });

  it("refuses data: and file: URLs too", () => {
    expect(normaliseJobUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normaliseJobUrl("file:///etc/passwd")).toBeNull();
  });

  it("refuses something that is not an address at all", () => {
    expect(normaliseJobUrl("ask Sarah for the link")).toBeNull();
    expect(normaliseJobUrl("localhost")).toBeNull();
  });

  it("treats empty and non-strings as no link, not as an error", () => {
    // Plenty of applications come through a recruiter with no public listing.
    expect(normaliseJobUrl("")).toBeNull();
    expect(normaliseJobUrl("   ")).toBeNull();
    expect(normaliseJobUrl(undefined)).toBeNull();
    expect(normaliseJobUrl(42)).toBeNull();
  });
});

describe("urlHost", () => {
  it("shows the host, without the www", () => {
    expect(urlHost("https://www.linkedin.com/jobs/view/123")).toBe("linkedin.com");
    expect(urlHost("https://boards.greenhouse.io/x/jobs/1")).toBe("boards.greenhouse.io");
  });

  it("falls back to the raw string rather than throwing", () => {
    expect(urlHost("not a url")).toBe("not a url");
  });
});
