import { describe, it, expect } from "vitest";
import {
  isDocumentKind,
  normaliseLabel,
  nextVersionNumber,
  versionsFor,
  liveDocuments,
  versionOutcomes,
  attachedVersion,
  versionName,
  defaultCoverLetterLabel,
  fileTypeLabel,
  formatBytes,
  hasFile,
  labelFromFileName,
  documentKey,
  findDuplicateDocument,
  ALLOWED_DOC_MIME,
  DOC_LABEL_MAX,
} from "./documents";
import type {
  MonitorApplication, MonitorApplicationEvent, MonitorDocument, MonitorDocumentVersion,
} from "@/types/monitor";

function doc(over: Partial<MonitorDocument> = {}): MonitorDocument {
  return {
    id: "d1",
    user_id: "u1",
    kind: "resume",
    label: "Analytics Engineer CV",
    created_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
    ...over,
  };
}

function ver(over: Partial<MonitorDocumentVersion> = {}): MonitorDocumentVersion {
  return {
    id: "v1",
    document_id: "d1",
    user_id: "u1",
    version: 1,
    content: "…",
    file_path: null,
    file_name: null,
    file_size: null,
    mime: null,
    note: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

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

describe("isDocumentKind / normaliseLabel", () => {
  it("accepts the two kinds an application can reference, and nothing else", () => {
    expect(isDocumentKind("resume")).toBe(true);
    expect(isDocumentKind("cover_letter")).toBe(true);
    expect(isDocumentKind("portfolio")).toBe(false);
    expect(isDocumentKind(null)).toBe(false);
  });

  it("trims, collapses whitespace, and rejects an empty label", () => {
    expect(normaliseLabel("  Analytics   Engineer CV ")).toBe("Analytics Engineer CV");
    expect(normaliseLabel("   ")).toBeNull();
    expect(normaliseLabel(7)).toBeNull();
  });

  it("caps rather than rejecting an over-long label", () => {
    expect(normaliseLabel("x".repeat(DOC_LABEL_MAX + 50))).toHaveLength(DOC_LABEL_MAX);
  });
});

describe("nextVersionNumber", () => {
  it("starts at 1 for a brand-new document", () => {
    expect(nextVersionNumber([])).toBe(1);
  });

  it("goes one past the highest version that exists", () => {
    expect(nextVersionNumber([ver({ version: 1 }), ver({ id: "b", version: 2 })])).toBe(3);
  });

  it("does not reuse a number after a version is deleted", () => {
    // Counting rows would hand out 3 again after v3 was removed, so two
    // different texts could both have been "v3" — and an application's claim
    // about which one it sent would stop being checkable.
    const remaining = [ver({ id: "a", version: 1 }), ver({ id: "c", version: 3 })];
    expect(nextVersionNumber(remaining)).toBe(4);
  });
});

describe("versionsFor / liveDocuments", () => {
  it("lists a document's versions newest first", () => {
    const all = [
      ver({ id: "a", version: 1 }),
      ver({ id: "c", version: 3 }),
      ver({ id: "b", version: 2 }),
    ];
    expect(versionsFor("d1", all).map(v => v.version)).toEqual([3, 2, 1]);
  });

  it("ignores another document's versions", () => {
    const all = [ver({ id: "mine" }), ver({ id: "theirs", document_id: "d2" })];
    expect(versionsFor("d1", all).map(v => v.id)).toEqual(["mine"]);
  });

  it("hides archived documents from the picker", () => {
    const docs = [doc({ id: "live" }), doc({ id: "old", archived_at: "2026-05-01T00:00:00.000Z" })];
    expect(liveDocuments(docs).map(d => d.id)).toEqual(["live"]);
  });

  it("filters by kind when asked", () => {
    const docs = [doc({ id: "cv" }), doc({ id: "letter", kind: "cover_letter" })];
    expect(liveDocuments(docs, "cover_letter").map(d => d.id)).toEqual(["letter"]);
  });
});

describe("versionOutcomes — the reason documents are entities", () => {
  const versions = [ver({ id: "v3", version: 3 }), ver({ id: "v4", version: 4 })];

  it("counts how many applications each version was sent with", () => {
    const apps = [
      app({ id: "a1", resume_version_id: "v3" }),
      app({ id: "a2", resume_version_id: "v3" }),
      app({ id: "a3", resume_version_id: "v4" }),
    ];
    const out = versionOutcomes("d1", versions, apps, [], "resume");
    expect(out.find(o => o.version.id === "v3")!.sent).toBe(2);
    expect(out.find(o => o.version.id === "v4")!.sent).toBe(1);
  });

  it("credits a version with an interview it won before being rejected", () => {
    // The same principle as the Interviews tile: a version that won an
    // interview still won it. A number that forgets would drop exactly when you
    // most want to trust it.
    const apps = [app({ id: "a1", resume_version_id: "v3", status: "rejected" })];
    const events = [
      ev({ application_id: "a1", status: "applied" }),
      ev({ id: "e2", application_id: "a1", status: "interview" }),
      ev({ id: "e3", application_id: "a1", status: "rejected" }),
    ];
    const out = versionOutcomes("d1", versions, apps, events, "resume");
    const v3 = out.find(o => o.version.id === "v3")!;
    expect(v3.interviews).toBe(1);
    expect(v3.rejected).toBe(1);
  });

  it("reports a rate as a whole percent of what was sent", () => {
    const apps = [
      app({ id: "a1", resume_version_id: "v3", status: "interview" }),
      app({ id: "a2", resume_version_id: "v3", status: "rejected" }),
      app({ id: "a3", resume_version_id: "v3", status: "rejected" }),
      app({ id: "a4", resume_version_id: "v3", status: "applied" }),
    ];
    expect(versionOutcomes("d1", versions, apps, [], "resume")
      .find(o => o.version.id === "v3")!.interviewRate).toBe(25);
  });

  it("keeps a version that has been sent nowhere, reporting zeroes", () => {
    // "v4, sent to nobody" is information. Dropping the row would make a new
    // version look like one that had failed.
    const out = versionOutcomes("d1", versions, [], [], "resume");
    expect(out).toHaveLength(2);
    expect(out.every(o => o.sent === 0 && o.interviewRate === 0)).toBe(true);
  });

  it("reads the cover-letter reference when asked about cover letters", () => {
    // The two attachments must not be counted against each other — a résumé's
    // record would otherwise inherit every cover letter's outcomes.
    const apps = [app({ id: "a1", cover_letter_version_id: "v3", resume_version_id: null })];
    expect(versionOutcomes("d1", versions, apps, [], "cover_letter")
      .find(o => o.version.id === "v3")!.sent).toBe(1);
    expect(versionOutcomes("d1", versions, apps, [], "resume")
      .find(o => o.version.id === "v3")!.sent).toBe(0);
  });

  it("counts an offer as an interview too, since you cannot be offered without one", () => {
    const apps = [app({ id: "a1", resume_version_id: "v3", status: "offer" })];
    const out = versionOutcomes("d1", versions, apps, [], "resume").find(o => o.version.id === "v3")!;
    expect(out.offers).toBe(1);
    expect(out.interviews).toBe(1);
  });
});

describe("attachedVersion", () => {
  const versions = [ver({ id: "v3", version: 3 })];

  it("resolves what was sent", () => {
    expect(attachedVersion(app({ resume_version_id: "v3" }), "resume", versions)?.version).toBe(3);
  });

  it("is null when nothing was attached", () => {
    expect(attachedVersion(app(), "resume", versions)).toBeNull();
  });

  it("is null, not a crash, when the version has been deleted", () => {
    // The FK is ON DELETE SET NULL so this should not normally happen, but a
    // dangling id must read as a gap in the record rather than an error.
    expect(attachedVersion(app({ resume_version_id: "gone" }), "resume", versions)).toBeNull();
  });
});

describe("versionName / defaultCoverLetterLabel", () => {
  it("names a version by its document and number", () => {
    expect(versionName(ver({ version: 3 }), [doc()])).toBe("Analytics Engineer CV v3");
  });

  it("still names a version whose document is missing", () => {
    expect(versionName(ver({ version: 2 }), [])).toBe("Document v2");
  });

  it("suggests a label so a one-off letter needs no filing system invented first", () => {
    expect(defaultCoverLetterLabel("Halcyon Labs")).toBe("Cover letter — Halcyon Labs");
  });

  it("falls back when the company name is unusable", () => {
    expect(defaultCoverLetterLabel("   ")).toBe("Cover letter —");
  });
});

describe("file helpers", () => {
  it("accepts only the formats a CV actually arrives in", () => {
    // An allowlist: anything absent is refused. A CV is never a .exe, and the
    // stored extension comes from this table rather than from the upload, so a
    // mislabelled file cannot name its own object on disk.
    expect(Object.keys(ALLOWED_DOC_MIME)).toContain("application/pdf");
    expect(ALLOWED_DOC_MIME["application/pdf"]).toBe("pdf");
    expect(ALLOWED_DOC_MIME["image/png"]).toBeUndefined();
    expect(ALLOWED_DOC_MIME["application/x-msdownload"]).toBeUndefined();
  });

  it("labels a file by its type, and falls back rather than showing nothing", () => {
    expect(fileTypeLabel("application/pdf")).toBe("PDF");
    expect(fileTypeLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("DOCX");
    expect(fileTypeLabel("application/x-weird")).toBe("FILE");
    expect(fileTypeLabel(null)).toBe("FILE");
  });

  it("formats sizes the way people read them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(216_064)).toBe("211 KB");
    expect(formatBytes(2_202_010)).toBe("2.1 MB");
  });

  it("shows nothing rather than '0 B' when the size is unknown", () => {
    expect(formatBytes(null)).toBe("");
  });

  it("knows whether a version carries the artifact or only its words", () => {
    expect(hasFile(ver())).toBe(false);
    expect(hasFile(ver({ file_path: "u1/d1/x.pdf" }))).toBe(true);
  });
});

describe("labelFromFileName", () => {
  it("uses the filename, because that is already the name of the thing", () => {
    // Requiring a typed name before anything can be saved is how a form ends up
    // with a dead button and nothing explaining what it wants.
    expect(labelFromFileName("cv-analytics-2026-06.pdf")).toBe("cv analytics 2026 06");
    expect(labelFromFileName("Resume_Senior_DE.docx")).toBe("Resume Senior DE");
  });

  it("drops only the final extension", () => {
    expect(labelFromFileName("cv.v2.final.pdf")).toBe("cv.v2.final");
  });

  it("copes with a file that has no extension", () => {
    expect(labelFromFileName("resume")).toBe("resume");
  });

  it("returns empty rather than a blank name when nothing is salvageable", () => {
    expect(labelFromFileName(".pdf")).toBe("");
    expect(labelFromFileName("   ")).toBe("");
  });
});

describe("findDuplicateDocument", () => {
  it("treats the same name as the same document, whatever the casing", () => {
    // Without this, uploading the same CV for a second application creates a
    // second document, and versionOutcomes reports "sent to 1" twice instead of
    // "sent to 2" once — which is the number the feature exists to produce.
    expect(documentKey("Senior  DE CV")).toBe(documentKey("senior de cv"));
    const docs = [doc({ id: "a", label: "Analytics Engineer CV" })];
    expect(findDuplicateDocument(docs, "resume", " analytics ENGINEER cv ")?.id).toBe("a");
  });

  it("keeps résumés and cover letters apart even when named the same", () => {
    // "Halcyon" as both a CV and a letter is a real thing to do.
    const docs = [doc({ id: "cv", kind: "resume", label: "Halcyon" })];
    expect(findDuplicateDocument(docs, "cover_letter", "Halcyon")).toBeNull();
    expect(findDuplicateDocument(docs, "resume", "Halcyon")?.id).toBe("cv");
  });

  it("ignores archived documents, so a name you put down can be reused", () => {
    const docs = [doc({ id: "old", archived_at: "2026-05-01T00:00:00.000Z" })];
    expect(findDuplicateDocument(docs, "resume", "Analytics Engineer CV")).toBeNull();
  });

  it("returns null for a genuinely new name", () => {
    expect(findDuplicateDocument([doc()], "resume", "Data Science CV")).toBeNull();
  });
});
