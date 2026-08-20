import { describe, it, expect } from "vitest";
import {
  MARGIN_BODY_MAX,
  normaliseBody,
  isBlank,
  stubFor,
  hasStub,
  appendStub,
  preview,
  sortNotes,
  filterNotes,
  normaliseRef,
} from "./notes";
import type { MarginNote } from "@/types/margin";

function note(over: Partial<MarginNote> = {}): MarginNote {
  return {
    id: "n1",
    user_id: "u1",
    surface: "cloud",
    ref_id: "aws/s3",
    ref_label: "Amazon S3",
    ref_href: "/cloud/aws/s3",
    body: "Object store, not a filesystem.",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...over,
  };
}

describe("normaliseBody", () => {
  it("does not trim, so a stub keeps the space the cursor sits after", () => {
    // The one rule that matters here. Eating the trailing space would move the
    // caret back onto the em dash every time the page reloaded.
    expect(normaliseBody("**Gotchas** — ")).toBe("**Gotchas** — ");
    expect(normaliseBody("\n  indented thought\n")).toBe("\n  indented thought\n");
  });

  it("caps a runaway paste rather than storing it", () => {
    expect(normaliseBody("x".repeat(MARGIN_BODY_MAX + 500))).toHaveLength(MARGIN_BODY_MAX);
  });

  it("treats a non-string body from an untrusted request as empty", () => {
    expect(normaliseBody(undefined)).toBe("");
    expect(normaliseBody(42)).toBe("");
    expect(normaliseBody(null)).toBe("");
  });
});

describe("isBlank", () => {
  it("counts whitespace-only as blank, so clearing the pad deletes the note", () => {
    // Otherwise a service you opened and thought about leaves an empty card in
    // the review list forever.
    expect(isBlank("")).toBe(true);
    expect(isBlank("   \n\n  ")).toBe(true);
  });

  it("counts a single character as worth keeping", () => {
    expect(isBlank("?")).toBe(false);
  });
});

describe("appendStub", () => {
  it("starts an empty pad with the stub alone, no leading blank lines", () => {
    expect(appendStub("", "Gotchas")).toBe("**Gotchas** — ");
    expect(appendStub("   ", "Gotchas")).toBe("**Gotchas** — ");
  });

  it("separates from existing writing by exactly one blank line", () => {
    expect(appendStub("Stores objects.", "Gotchas"))
      .toBe("Stores objects.\n\n**Gotchas** — ");
  });

  it("normalises ragged trailing whitespace rather than stacking onto it", () => {
    // A pad edited over several sittings ends in all sorts of states; the gap
    // between sections has to look the same regardless.
    expect(appendStub("Stores objects.\n\n\n  ", "Gotchas"))
      .toBe("Stores objects.\n\n**Gotchas** — ");
  });

  it("refuses to add a section twice, so a pad can't grow two half-filled Gotchas", () => {
    const body = "**Gotchas** — eventual consistency on overwrite";
    expect(appendStub(body, "Gotchas")).toBe(body);
  });

  it("is not fooled by the heading merely appearing in a sentence", () => {
    const body = "The Gotchas section is worth rereading.";
    expect(hasStub(body, "Gotchas")).toBe(false);
    expect(appendStub(body, "Gotchas"))
      .toBe("The Gotchas section is worth rereading.\n\n**Gotchas** — ");
  });

  it("keeps headings with spaces intact", () => {
    expect(stubFor("Key facts & limits")).toBe("**Key facts & limits** — ");
    expect(appendStub("", "Key facts & limits")).toBe("**Key facts & limits** — ");
  });
});

describe("preview", () => {
  it("flattens to one line so a card cannot grow with the note", () => {
    expect(preview("First line.\n\n**Gotchas** — second line."))
      .toBe("First line. Gotchas — second line.");
  });

  it("strips markdown rather than rendering it, so a card subtitle stays a label", () => {
    expect(preview("## Heading\n`code` and *emphasis*")).toBe("Heading code and emphasis");
  });

  it("truncates on an ellipsis without leaving a dangling space", () => {
    // 20 chars of "word word word word " minus the trailing space, plus the
    // ellipsis — the trimEnd is the whole point of the assertion.
    const out = preview(`${"word ".repeat(60)}`, 20);
    expect(out).toBe("word word word word…");
    expect(out.endsWith(" …")).toBe(false);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves a short note exactly as written", () => {
    expect(preview("Short one.")).toBe("Short one.");
  });
});

describe("sortNotes", () => {
  it("puts the most recently written first and does not mutate the input", () => {
    const input = [
      note({ id: "old", updated_at: "2026-08-01T10:00:00.000Z" }),
      note({ id: "new", updated_at: "2026-08-19T10:00:00.000Z" }),
    ];
    expect(sortNotes(input).map(n => n.id)).toEqual(["new", "old"]);
    expect(input.map(n => n.id)).toEqual(["old", "new"]);
  });
});

describe("filterNotes", () => {
  const notes = [
    note({ id: "s3", ref_label: "Amazon S3", body: "Object store, not a filesystem." }),
    note({ id: "bq", ref_label: "BigQuery", body: "Charges by bytes scanned — partition." }),
  ];

  it("matches what you wrote, not only what it was about", () => {
    // The reason to search your own notes is to find the sentence. Matching
    // titles alone would make this a worse index than the catalog beside it.
    expect(filterNotes(notes, "partition").map(n => n.id)).toEqual(["bq"]);
  });

  it("matches the thing annotated too, case-insensitively", () => {
    expect(filterNotes(notes, "amazon").map(n => n.id)).toEqual(["s3"]);
  });

  it("returns everything for an empty or whitespace query", () => {
    expect(filterNotes(notes, "")).toHaveLength(2);
    expect(filterNotes(notes, "   ")).toHaveLength(2);
  });

  it("returns nothing rather than everything when there is no match", () => {
    expect(filterNotes(notes, "kubernetes")).toEqual([]);
  });
});

describe("normaliseRef", () => {
  const ref = { ref_id: "aws/s3", ref_label: "Amazon S3", ref_href: "/cloud/aws/s3" };

  it("accepts and trims a well-formed reference", () => {
    expect(normaliseRef({ ref_id: " aws/s3 ", ref_label: " Amazon S3 ", ref_href: " /cloud/aws/s3 " }))
      .toEqual(ref);
  });

  it("rejects an absolute URL, so nothing can plant an off-site link in your notes", () => {
    // The review list renders ref_href as a link. Your own notes are the last
    // place a link should be able to point somewhere you did not choose.
    expect(normaliseRef({ ...ref, ref_href: "https://evil.example/phish" })).toBeNull();
  });

  it("rejects a protocol-relative href, which a browser treats as absolute", () => {
    expect(normaliseRef({ ...ref, ref_href: "//evil.example/phish" })).toBeNull();
  });

  it("rejects a blank id or label rather than storing an unnameable row", () => {
    expect(normaliseRef({ ...ref, ref_id: "   " })).toBeNull();
    expect(normaliseRef({ ...ref, ref_label: "" })).toBeNull();
  });

  it("rejects a body that isn't an object, or fields that aren't strings", () => {
    expect(normaliseRef(null)).toBeNull();
    expect(normaliseRef("aws/s3")).toBeNull();
    expect(normaliseRef({ ...ref, ref_id: 7 })).toBeNull();
  });
});
