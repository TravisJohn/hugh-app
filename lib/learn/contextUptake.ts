/**
 * Measurements over the 5-whys answers, for the curriculum provenance store.
 *
 * The point of this module is what it deliberately does NOT produce: it turns
 * the learner's sentences into numbers, so that `track_generations` can record
 * something about the context a curriculum was built from without keeping a
 * second copy of the words themselves.
 *
 * That split is the whole design (migration 048, decisions D1/D2/R4):
 *
 *  - `goal_answers` holds the words, is learner-owned, and is deletable.
 *  - `track_generations` holds the eval record, is service-role only, and
 *    keeps only what survives a deletion — because a number derived from a
 *    sentence is not the sentence.
 *
 * The consequence to understand: after a learner deletes their answers you can
 * still ask "did more context produce a longer track?" and "did the milestones
 * pick up the learner's own vocabulary?", but you can no longer re-run the
 * model on that input. That is what deletion ought to mean.
 *
 * Why these are computed at WRITE time and stored, rather than joined at read
 * time: a join computes a different answer once the answers are gone, silently,
 * on a row that still says `answer_count = 5`. The same query would give one
 * number in September and another in October with nothing in the data to
 * explain the change. Frozen at generation, the figure is a fact about that
 * generation forever.
 *
 * Pure: no I/O, no clock, no dependencies. Callers pass text in and get numbers
 * back, so the rules can be unit-tested rather than inferred from a database.
 */

/** One 5-whys exchange, in the shape the routes already pass around. */
export interface QAPair {
  question: string;
  answer:   string;
}

/**
 * Minimum length of a token that can count as "content".
 *
 * Two characters and under are almost entirely articles, prepositions and
 * initialisms too generic to indicate anything ("to", "of", "AI"). Three is
 * the first length that carries topic-bearing words we care about — "SQL",
 * "ETL", "dbt" — and those are exactly the terms whose reappearance in a
 * milestone is meaningful.
 */
const MIN_TERM_CHARS = 3;

/**
 * Words dropped before measuring overlap.
 *
 * Kept deliberately short and generic. This is not a linguistics project: the
 * list only has to remove words so common that their reappearance in a
 * milestone says nothing about whether the model read the learner's context.
 * Adding domain words here would be a mistake — "pipeline" reappearing IS the
 * signal, not noise.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "yours", "with",
  "that", "this", "these", "those", "have", "has", "had", "from", "they",
  "them", "their", "there", "here", "what", "when", "where", "which", "who",
  "whom", "why", "how", "all", "any", "can", "could", "would", "should",
  "will", "shall", "may", "might", "must", "was", "were", "been", "being",
  "into", "over", "under", "then", "than", "some", "such", "own", "same",
  "just", "also", "more", "most", "much", "many", "very", "too", "get",
  "got", "want", "wanted", "need", "needed", "like", "make", "made", "does",
  "did", "doing", "done", "about", "because", "while", "after", "before",
  "learn", "learning", "understand", "know", "knowing", "able", "work",
  "working", "job", "role", "time", "way", "thing", "things", "lot", "bit",

  // Filler, as distinct from the grammatical words above. A learner who types
  // "idk" or "not really sure" has given no context, and without these the
  // measure would read that as context the model ignored — scoring 0 where the
  // honest answer is "no signal". See the null-versus-zero note on
  // `contextUptake`.
  "idk", "dunno", "sure", "yeah", "yep", "nope", "okay", "stuff", "really",
  "maybe", "guess", "kinda", "sorta", "etc",
]);

/**
 * Reduce a word to a comparison form.
 *
 * Only a trailing plural "s" is removed, and only where doing so is safe:
 * "pipelines" and "pipeline" should count as the same term, but "analysis",
 * "business" and "status" must not be mangled into stems that then fail to
 * match their own singular form. Anything cleverer needs a real stemmer, and a
 * real stemmer is a dependency this measure does not justify.
 */
function stem(word: string): string {
  if (word.length <= 4) return word;
  if (!word.endsWith("s")) return word;
  if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  return word.slice(0, -1);
}

/**
 * Split free text into the set of distinct content terms it contains.
 *
 * Non-letter/digit characters are treated as separators, so punctuation,
 * hyphens and markdown all fall away. The result is a Set because a learner
 * repeating a word ten times should not weigh ten times as much — uptake is
 * about which ideas carried over, not how insistently they were typed.
 */
export function contentTerms(text: string): Set<string> {
  const terms = new Set<string>();

  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < MIN_TERM_CHARS) continue;
    if (STOPWORDS.has(raw)) continue;

    const term = stem(raw);
    // Re-check after stemming: "needs" stems to "need", which is a stopword.
    if (term.length < MIN_TERM_CHARS || STOPWORDS.has(term)) continue;

    terms.add(term);
  }

  return terms;
}

/**
 * Total characters of answer text the learner wrote.
 *
 * Answers only — not the questions, which Hugh generated and which would make
 * the figure say more about the prompt than about the learner. This is the
 * "did more context help?" axis, and it survives the words being deleted.
 */
export function answerChars(answers: readonly QAPair[]): number {
  return answers.reduce((total, a) => total + (a.answer ?? "").length, 0);
}

/** Milestone text as generated — the fields a curriculum is actually made of. */
export interface MilestoneText {
  title:   string;
  summary: string;
}

/**
 * What fraction of the learner's content terms show up in the curriculum.
 *
 * Returns a value in [0, 1], or `null` when the question cannot be asked:
 * no answers, or answers that contain no content terms at all once stopwords
 * are removed ("idk", "not sure"). Null is not zero. Zero means the model
 * ignored real context; null means there was no context to ignore, and
 * flattening the two would quietly drag down the average for every learner who
 * skipped the questions.
 *
 * Note what this measure is and isn't. High uptake means the milestones use
 * the learner's own vocabulary; it does not mean the curriculum is good, and a
 * model could score well by parroting. It earns its place as a *comparative*
 * number — arm A against arm B, one model against another, on the same inputs
 * — which is exactly how E2 uses it. Read as an absolute score it means very
 * little.
 */
export function contextUptake(
  answers:    readonly QAPair[],
  milestones: readonly MilestoneText[],
): number | null {
  const answerText = answers.map(a => a.answer ?? "").join(" ");
  const wanted     = contentTerms(answerText);

  if (wanted.size === 0) return null;

  const produced = contentTerms(
    milestones.map(m => `${m.title ?? ""} ${m.summary ?? ""}`).join(" "),
  );

  let hits = 0;
  for (const term of wanted) {
    if (produced.has(term)) hits++;
  }

  return hits / wanted.size;
}
