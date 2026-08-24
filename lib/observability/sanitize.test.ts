import { describe, it, expect } from "vitest";
import {
  sanitize,
  sanitizeDetail,
  redact,
  truncate,
  messageOf,
  errorClassOf,
  MAX_ERROR_NOTE_CHARS,
  MAX_DETAIL_STRING_CHARS,
  MAX_DETAIL_KEYS,
  MIN_REDACTABLE_CHARS,
  REDACTED,
} from "./sanitize";

// These tests are the privacy guarantee. If one of them goes green while the
// behaviour changes, learner text reaches the database.

// ── Getting a message out of anything ───────────────────────────────────────

describe("messageOf - throw accepts any value, so this must survive any value", () => {
  it("reads an Error's message", () => {
    expect(messageOf(new Error("insert failed"))).toBe("insert failed");
  });

  it("reads a subclass's message", () => {
    class TrackGenerationError extends Error {}
    expect(messageOf(new TrackGenerationError("no milestones"))).toBe("no milestones");
  });

  it("takes a thrown string as the message", () => {
    expect(messageOf("plain string throw")).toBe("plain string throw");
  });

  it("reads a message off a plain object, as Supabase errors are shaped", () => {
    expect(messageOf({ message: "permission denied", code: "42501" })).toBe("permission denied");
  });

  it("never throws on values that carry no message at all", () => {
    expect(messageOf(null)).toBe("Unknown error");
    expect(messageOf(undefined)).toBe("Unknown error");
    expect(messageOf({})).toBe("Unknown error");
    expect(messageOf([])).toBe("Unknown error");
    expect(messageOf(new Error(""))).toBe("Unknown error");
  });

  it("keeps a thrown number or boolean rather than calling it unknown", () => {
    expect(messageOf(500)).toBe("500");
    expect(messageOf(false)).toBe("false");
  });
});

// ── Truncation ──────────────────────────────────────────────────────────────

describe("truncate - the ceiling is exact, not approximate", () => {
  it("leaves anything at or under the limit untouched", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("exactly10!", 10)).toBe("exactly10!");
  });

  it("never returns more characters than the limit", () => {
    const cut = truncate("a".repeat(500), 10);
    expect(cut).toHaveLength(10);
  });

  it("marks that something was removed", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });

  it("handles a zero or negative limit without throwing", () => {
    expect(truncate("anything", 0)).toBe("");
    expect(truncate("anything", -5)).toBe("");
  });
});

// ── Redaction ───────────────────────────────────────────────────────────────

describe("redact - removing what the learner typed", () => {
  it("removes the secret wherever it appears", () => {
    const out = redact("could not parse response for SQL window functions", ["SQL window functions"]);
    expect(out).toBe(`could not parse response for ${REDACTED}`);
    expect(out).not.toContain("window functions");
  });

  it("removes every occurrence, not just the first", () => {
    const out = redact("topic pandas failed; retrying pandas", ["pandas"]);
    expect(out).toBe(`topic ${REDACTED} failed; retrying ${REDACTED}`);
  });

  it("matches regardless of case, because an error may echo it differently", () => {
    const out = redact("Rejected: Bayesian Inference is out of scope", ["bayesian inference"]);
    expect(out).not.toMatch(/bayesian/i);
  });

  it("redacts the longer secret when two overlap", () => {
    // Shortest-first would replace "regression" inside "linear regression" and
    // leave "linear " standing in the log.
    const out = redact("failed on linear regression", ["regression", "linear regression"]);
    expect(out).toBe(`failed on ${REDACTED}`);
    expect(out).not.toContain("linear");
  });

  it("treats a secret containing regex characters as literal text", () => {
    // A topic like "A/B testing (t-test)" must not be compiled as a pattern.
    const out = redact("could not judge A/B testing (t-test)", ["A/B testing (t-test)"]);
    expect(out).toBe(`could not judge ${REDACTED}`);
  });

  it("matches a secret whose whitespace differs from the message's", () => {
    const out = redact("failed on time series analysis", ["time  series\nanalysis"]);
    expect(out).toBe(`failed on ${REDACTED}`);
  });

  it("ignores secrets too short to be private, which would shred the message", () => {
    // Redacting the topic "R" would replace every letter R in the error.
    const out = redact("permission denied for relation tracks", ["R", "a"]);
    expect(out).toBe("permission denied for relation tracks");
    expect(MIN_REDACTABLE_CHARS).toBe(3);
  });

  it("ignores empty and whitespace-only secrets", () => {
    // An empty needle would otherwise match at every position.
    const out = redact("insert failed", ["", "   ", "\n"]);
    expect(out).toBe("insert failed");
  });

  it("leaves the message alone when there are no secrets", () => {
    expect(redact("duplicate key value", [])).toBe("duplicate key value");
  });
});

// ── sanitize: the whole pipeline ────────────────────────────────────────────

describe("sanitize - the function callers actually use", () => {
  it("redacts before truncating, so a cut cannot leave half a secret standing", () => {
    // This is the ordering bug the pipeline exists to avoid. The topic sits
    // past the 200-character mark; truncating first would drop it, but a topic
    // straddling the boundary would survive in part. Redaction runs first, so
    // position is irrelevant.
    const topic   = "hierarchical bayesian models";
    const message = "x".repeat(190) + " " + topic + " " + "y".repeat(50);
    const out     = sanitize(new Error(message), [topic]);

    expect(out).not.toContain("bayesian");
    expect(out.length).toBeLessThanOrEqual(MAX_ERROR_NOTE_CHARS);
  });

  it("keeps a straddling secret out even when it lands on the boundary", () => {
    const topic   = "customer churn cohorts";
    const message = "e".repeat(MAX_ERROR_NOTE_CHARS - 10) + topic;
    const out     = sanitize(new Error(message), [topic]);

    expect(out).not.toContain("customer");
    expect(out).not.toContain("churn");
  });

  it("never exceeds the note ceiling", () => {
    expect(sanitize(new Error("z".repeat(5000)))).toHaveLength(MAX_ERROR_NOTE_CHARS);
  });

  it("flattens newlines so a note stays one line", () => {
    const out = sanitize(new Error("first line\n\tsecond line\n\n third"));
    expect(out).toBe("first line second line third");
  });

  it("works with no secrets supplied at all", () => {
    expect(sanitize(new Error("duplicate key"))).toBe("duplicate key");
  });

  it("survives a null throw without producing an empty note", () => {
    expect(sanitize(null)).toBe("Unknown error");
  });

  it("scrubs a Supabase-shaped error that quotes the rejected row", () => {
    // Postgres errors echo row values, which is one of the two ways learner
    // text reaches a log without anyone intending it.
    const topic = "retail basket analysis";
    const err   = { message: `new row for relation "tracks" violates check: topic=${topic}` };
    const out   = sanitize(err, [topic]);

    expect(out).not.toContain("retail");
    expect(out).toContain(REDACTED);
  });
});

// ── errorClassOf ────────────────────────────────────────────────────────────

describe("errorClassOf - grouping without a stack trace", () => {
  it("uses the error's name", () => {
    class TrackGenerationError extends Error {
      constructor(m: string) { super(m); this.name = "TrackGenerationError"; }
    }
    expect(errorClassOf(new TrackGenerationError("nope"))).toBe("TrackGenerationError");
    expect(errorClassOf(new TypeError("bad"))).toBe("TypeError");
  });

  it("falls back rather than throwing on values that are not errors", () => {
    expect(errorClassOf("a string")).toBe("UnknownError");
    expect(errorClassOf(null)).toBe("UnknownError");
    expect(errorClassOf({ message: "supabase-shaped" })).toBe("UnknownError");
  });
});

// ── sanitizeDetail: the free-text guarantee ─────────────────────────────────

describe("sanitizeDetail - the 40-character ceiling is the guarantee", () => {
  it("truncates any string over the limit, rather than dropping the row", () => {
    const long = "a".repeat(400);
    const out  = sanitizeDetail({ note: long });

    expect(out.note).toHaveLength(40);
    // Pinned: the ceiling is part of the contract, not a tunable.
    expect(MAX_DETAIL_STRING_CHARS).toBe(40);
  });

  it("enforces the ceiling on every string, not just the first", () => {
    // Asserted against the literal 40, not MAX_DETAIL_STRING_CHARS. Measuring
    // the guarantee against the constant that defines it is self-fulfilling:
    // raising the constant would keep this green while the guarantee is gone.
    const out = sanitizeDetail({
      one:   "b".repeat(100),
      two:   "c".repeat(100),
      three: "d".repeat(100),
    });
    for (const value of Object.values(out)) {
      expect(String(value).length).toBeLessThanOrEqual(40);
    }
  });

  it("leaves short enum-ish strings exactly as they are", () => {
    expect(sanitizeDetail({ source: "qa", verdict: "still-building" }))
      .toEqual({ source: "qa", verdict: "still-building" });
  });

  it("redacts detail strings too, before truncating them", () => {
    // A caller could put the topic in detail as easily as in an error message.
    const out = sanitizeDetail({ label: "topic: dimensional modelling" }, ["dimensional modelling"]);
    expect(out.label).not.toContain("dimensional");
  });

  it("keeps finite numbers and booleans", () => {
    expect(sanitizeDetail({ attempt: 2, milestones: 6, cached: true, retried: false }))
      .toEqual({ attempt: 2, milestones: 6, cached: true, retried: false });
  });

  it("drops values that are not bounded primitives", () => {
    // An array or nested object is a container for exactly the free text this
    // field exists to exclude, so it is dropped rather than stringified.
    const out = sanitizeDetail({
      nested:    { prompt: "the learner's entire question" },
      list:      ["a", "b"],
      nothing:   null,
      missing:   undefined,
      notANum:   NaN,
      unbounded: Infinity,
      fn:        () => "hi",
      kept:      1,
    });

    expect(out).toEqual({ kept: 1 });
  });

  it("drops keys that do not look like identifiers", () => {
    // A key carries free text just as well as a value does.
    const out = sanitizeDetail({
      goodKey:                    1,
      "the learner asked about":  2,
      "spaces here":              3,
      "":                         4,
      "kebab-case":               5,
      ["x".repeat(60)]:           6,
    });

    expect(Object.keys(out)).toEqual(["goodKey"]);
  });

  it("caps how many keys can be stored, so detail cannot become a document", () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 40; i++) many[`key${i}`] = i;

    const out = sanitizeDetail(many);
    expect(Object.keys(out)).toHaveLength(MAX_DETAIL_KEYS);
    // Insertion order, so which keys survive is predictable rather than random.
    expect(Object.keys(out)[0]).toBe("key0");
  });

  it("does not let dropped values consume the key budget", () => {
    // Invalid entries are skipped, not counted - otherwise a caller could
    // push out real detail with junk.
    const input: Record<string, unknown> = { bad1: null, bad2: [], bad3: {} };
    for (let i = 0; i < MAX_DETAIL_KEYS; i++) input[`good${i}`] = i;

    const out = sanitizeDetail(input);
    expect(Object.keys(out)).toHaveLength(MAX_DETAIL_KEYS);
    expect(out.good0).toBe(0);
  });

  it("returns an empty object for an empty input, never null", () => {
    expect(sanitizeDetail({})).toEqual({});
  });

  it("flattens whitespace inside detail strings", () => {
    expect(sanitizeDetail({ note: "two\nlines  here" })).toEqual({ note: "two lines here" });
  });
});
