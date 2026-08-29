import { describe, it, expect } from "vitest";
import {
  answerChars,
  contentTerms,
  contextUptake,
  type QAPair,
} from "./contextUptake";

const qa = (answer: string, question = "Why do you want to learn this?"): QAPair => ({
  question,
  answer,
});

describe("contentTerms - what counts as a content word", () => {
  it("drops stopwords so their reappearance cannot inflate uptake", () => {
    const terms = contentTerms("I want to learn about the pipelines");
    expect(terms.has("pipeline")).toBe(true);
    expect(terms.has("the")).toBe(false);
    expect(terms.has("want")).toBe(false);
    expect(terms.has("learn")).toBe(false);
  });

  it("keeps short domain initialisms, which are the highest-signal terms", () => {
    const terms = contentTerms("I use SQL and dbt for ETL");
    expect(terms.has("sql")).toBe(true);
    expect(terms.has("dbt")).toBe(true);
    expect(terms.has("etl")).toBe(true);
  });

  it("treats punctuation and hyphens as separators, not as part of a word", () => {
    const terms = contentTerms("event-driven architecture, done well.");
    expect(terms.has("event")).toBe(true);
    expect(terms.has("driven")).toBe(true);
    expect(terms.has("architecture")).toBe(true);
  });

  it("counts a repeated word once, so insistence does not outweigh coverage", () => {
    expect(contentTerms("kafka kafka kafka").size).toBe(1);
  });

  it("matches a plural against its singular", () => {
    expect(contentTerms("warehouses")).toEqual(contentTerms("warehouse"));
  });

  it("leaves words that merely end in s alone, so they still match themselves", () => {
    // The bug this guards: naive plural-stripping turns "analysis" into
    // "analysi", which then fails to match the identical word in a milestone.
    for (const word of ["analysis", "business", "status"]) {
      expect(contentTerms(word).has(word)).toBe(true);
    }
  });

  it("re-checks the stopword list after stemming", () => {
    // "needs" -> "need", which is a stopword and must not survive as a term.
    expect(contentTerms("needs").size).toBe(0);
  });
});

describe("answerChars - the 'did more context help' axis", () => {
  it("totals the answers the learner wrote", () => {
    expect(answerChars([qa("abc"), qa("de")])).toBe(5);
  });

  it("counts answers only, never the questions Hugh generated", () => {
    const long = qa("hi", "an extremely long generated question ".repeat(10));
    expect(answerChars([long])).toBe(2);
  });

  it("is zero when the learner skipped the questions", () => {
    expect(answerChars([])).toBe(0);
  });
});

describe("contextUptake - how much of the learner's vocabulary carried over", () => {
  const answers = [
    qa("I run Airflow pipelines at work and keep breaking the backfills"),
  ];

  it("scores 1 when every content term reappears in the curriculum", () => {
    const uptake = contextUptake(
      [qa("Airflow backfills")],
      [{ title: "Airflow backfill", summary: "Running one safely." }],
    );
    expect(uptake).toBe(1);
  });

  it("scores 0 when the curriculum shares none of the learner's terms", () => {
    const uptake = contextUptake(answers, [
      { title: "Normalisation forms", summary: "Third normal form and beyond." },
    ]);
    expect(uptake).toBe(0);
  });

  it("scores between 0 and 1 when some terms carry over", () => {
    const uptake = contextUptake(answers, [
      { title: "Airflow scheduling", summary: "How pipelines are triggered." },
    ]);
    expect(uptake).toBeGreaterThan(0);
    expect(uptake).toBeLessThan(1);
  });

  it("reads the summary as well as the title", () => {
    const titleOnly = contextUptake([qa("kafka")], [{ title: "kafka", summary: "" }]);
    const inSummary = contextUptake([qa("kafka")], [{ title: "", summary: "kafka" }]);
    expect(titleOnly).toBe(1);
    expect(inSummary).toBe(1);
  });

  it("returns null, not zero, when the learner gave no answers", () => {
    // Null means "no context existed"; zero means "context existed and was
    // ignored". Flattening them would drag the average down for every learner
    // who pressed Skip.
    expect(contextUptake([], [{ title: "Anything", summary: "At all." }])).toBeNull();
  });

  it("returns null when the answers carry no content terms at all", () => {
    expect(contextUptake([qa("idk, not sure")], [{ title: "x", summary: "y" }])).toBeNull();
  });

  it("returns zero when there is context but the curriculum is empty", () => {
    expect(contextUptake(answers, [])).toBe(0);
  });

  it("is unaffected by how often the learner repeated a term", () => {
    const once   = contextUptake([qa("kafka streams")], [{ title: "kafka", summary: "" }]);
    const many   = contextUptake([qa("kafka kafka kafka streams")], [{ title: "kafka", summary: "" }]);
    expect(once).toBe(many);
  });
});
