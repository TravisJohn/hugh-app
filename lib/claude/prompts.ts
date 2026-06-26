import { isPresetRoom, type PresetRoom, type Room } from "@/types";

export const ROOM_CONTEXT: Record<PresetRoom, string> = {
  data_engineering:
    "Data Engineering (ETL pipelines, orchestration, data modeling, warehousing, streaming)",
  data_science:
    "Data Science (statistics, ML models, A/B testing, experimentation, analytics)",
  ml_engineering:
    "ML Engineering (model deployment, MLOps, serving infrastructure, inference optimisation)",
};

// ── Question generation ───────────────────────────────────────────────────

export function questionGenerationPrompt(
  topicContext:      string | null,
  previousQuestions: string[],
  jobDescription?:   string,
): string {
  const roleIntro = topicContext
    ? `You are a senior interviewer at a top tech company hiring for ${topicContext} roles.`
    : `You are a senior interviewer. Infer the interview domain, required stack, and seniority level entirely from the job description below.`;

  const avoidBlock =
    previousQuestions.length > 0
      ? `\nDo NOT ask about any of these already-asked questions:\n${previousQuestions
          .map((q) => `- "${q}"`)
          .join("\n")}`
      : "";

  const jobBlock = jobDescription
    ? `\n\nThe candidate is applying for a role matching this job description:\n${jobDescription.slice(0, 1500)}\nTailor your question toward the specific stack, seniority level, and responsibilities mentioned.`
    : "";

  return `${roleIntro}

Generate ONE technical interview question for a mid-to-senior level candidate.${avoidBlock}${jobBlock}

Requirements:
- Specific and practical — answerable verbally in 2-3 minutes
- Tests depth of understanding, not just surface knowledge
- The best answer must be 3-5 sentences: technically precise, well-structured, and demonstrate real expertise

Respond with ONLY valid JSON, no markdown fences, no commentary:
{"question": "...", "bestAnswer": "..."}`;
}

export function introQuestionBestAnswerPrompt(question: string): string {
  return `You are an interview coach. For the introductory interview question below, write an instructional ideal answer in prose form.

Explain the *structure and approach* of a strong answer — what to cover, in what order, and why. Write it as coaching advice, not as a fill-in-the-blank template. Do not use placeholders like [Job Title], [X years], or [Company Name]. Write 3-5 sentences of concrete, actionable guidance.

Example style: "A strong answer follows a clear arc: where you've been, what you've built, and why this role is the natural next step. Open with your current role and the most relevant part of your background, name one specific accomplishment with a measurable outcome, then land on what you're looking for next and why this role fits. Keep it under 90 seconds — confident, not comprehensive."

Question: "${question}"

Respond with ONLY valid JSON, no markdown fences:
{"bestAnswer": "..."}`;
}

// ── Similarity check ──────────────────────────────────────────────────────

export function similarityCheckPrompt(
  bestAnswer: string,
  transcript: string
): string {
  return `You are evaluating whether a candidate's interview answer matches the approach of a model answer.

Model answer: "${bestAnswer}"

Candidate answer: "${transcript}"

Does the candidate's answer capture at least 90% of the key points and approach from the model answer?
Respond with JSON only: {"usedBestAnswer": true/false, "alignmentScore": 0-100}`;
}

// ── Hint generation ───────────────────────────────────────────────────────

export function hintGenerationPrompt(question: string, topicContext: string): string {
  return `You are a concise interview coach.
The candidate is being asked: "${question}"
This is a ${topicContext} interview.

Give a single-sentence hint that nudges them toward the right approach without giving away the answer.
Do NOT mention the answer. Focus on the thinking framework or key concept they should consider.
Return JSON only: { "hint": "..." }`;
}

// ── Feedback generation ───────────────────────────────────────────────────

export function feedbackGenerationPrompt({
  question,
  bestAnswer,
  transcript,
  viewedHint,
  viewedBestAnswer,
  usedBestAnswer,
}: {
  question: string;
  bestAnswer: string;
  transcript: string;
  viewedHint: boolean;
  viewedBestAnswer: boolean;
  usedBestAnswer: boolean;
}): string {
  const scaffoldingLines = [
    viewedHint ? "They requested a hint before answering." : null,
    viewedBestAnswer
      ? "They viewed the ideal answer before answering."
      : "They did not view the ideal answer before answering.",
  ]
    .filter(Boolean)
    .join(" ");

  const viewedLine = scaffoldingLines;

  const instruction = usedBestAnswer
    ? `Their answer closely follows the suggested approach (>90% alignment).
Explain why this approach is strong and what makes it the right answer. Acknowledge what they did well.`
    : `Their answer does NOT closely follow the suggested approach.
Give direct, constructive feedback: highlight what they got right, what they missed, and what the best answer adds.`;

  return `You are a tough but fair interview coach.

The candidate was asked: "${question}"
The suggested best answer was: "${bestAnswer}"
The candidate answered: "${transcript}"
${viewedLine}
Claude judged their answer as ${usedBestAnswer ? "matching" : "not matching"} the suggested approach.

${instruction}

Keep feedback to 2-3 sentences. Start with a short verdict phrase (e.g. "Strong answer." or "Partially there.").
Do not use markdown formatting, asterisks, bold markers, or any special characters.
Reply with ONLY the feedback text — no JSON, no preamble.`;
}

// ── Submit answer (merged similarity judgment + feedback) ────────────────
// One call replaces the former check-similarity → generate-feedback pair: both
// sent the same question/bestAnswer/transcript, so combining halves the calls
// and the duplicated input context. Returns the alignment verdict AND the
// coaching feedback in a single JSON object.
export function submitAnswerPrompt({
  question,
  bestAnswer,
  transcript,
  viewedHint,
  viewedBestAnswer,
}: {
  question: string;
  bestAnswer: string;
  transcript: string;
  viewedHint: boolean;
  viewedBestAnswer: boolean;
}): string {
  const scaffoldingLines = [
    viewedHint ? "They requested a hint before answering." : null,
    viewedBestAnswer
      ? "They viewed the ideal answer before answering."
      : "They did not view the ideal answer before answering.",
  ]
    .filter(Boolean)
    .join(" ");

  return `You are a tough but fair interview coach.

The candidate was asked: "${question}"
The suggested best answer was: "${bestAnswer}"
The candidate answered: "${transcript}"
${scaffoldingLines}

Do two things:
1. Judge how well the candidate's answer captures the key points and approach of
   the suggested best answer. Score alignment 0-100; an answer that captures at
   least 90% of the key points counts as having used the best approach.
2. Write 2-3 sentences of feedback consistent with that judgment. If alignment is
   high (>=90), explain why this approach is strong and acknowledge what they did
   well. Otherwise highlight what they got right, what they missed, and what the
   best answer adds. Start with a short verdict phrase (e.g. "Strong answer." or
   "Partially there."). Do not use markdown, asterisks, or special characters.

Return ONLY valid JSON, no markdown fences:
{"usedBestAnswer": <true if alignmentScore >= 90>, "alignmentScore": <0-100>, "feedback": "<2-3 sentences>"}`;
}

// ── Session assessment ────────────────────────────────────────────────────

export function sessionAssessmentPrompt(params: {
  room:  Room;
  topic?: string;
  questionsAndAnswers: Array<{
    question:       string;
    transcript:     string;
    feedback:       string;
    usedBestAnswer: boolean;
  }>;
}): string {
  const { room, topic, questionsAndAnswers } = params;
  const topicContext = isPresetRoom(room) ? ROOM_CONTEXT[room] : (topic ?? 'general data and ML engineering');

  const qaList = questionsAndAnswers
    .map(
      (qa, i) =>
        `Q${i + 1}: "${qa.question}"\nAnswer: "${qa.transcript}"\nFeedback: "${qa.feedback}"\nUsed ideal answer: ${qa.usedBestAnswer ? 'yes' : 'no'}`,
    )
    .join('\n\n');

  return `You are a senior interview coach reviewing a candidate's mock interview session.

Room: ${topicContext}
Questions answered: ${questionsAndAnswers.length}

Here are the question/answer pairs with individual feedback:
${qaList}

Write a 2-3 sentence overall assessment. Be direct and honest.
Highlight one strength and one area to develop.
Start with the candidate's biggest takeaway.
Return JSON only: { "assessment": "..." }`;
}

// ── Focused learning chat ─────────────────────────────────────────────────

export function focusedLearningSystemPrompt(topic: string): string {
  return `You are Hugh, an AI learning coach specialising exclusively in data and analytics. Hugh's domain covers: data engineering, data science, machine learning, analytics, statistics, SQL, databases, Python for data, cloud data platforms, BI tools, and related data tooling.

The user is currently studying: "${topic}".

Your rules:
1. If the question is related to ${topic} or falls within the data and analytics domain: give a thorough, educational answer. Use concrete examples. Use bullet points or tables for structured information. 3–6 sentences or equivalent.
2. If the question is entirely outside data and analytics (e.g. cooking, creative writing, general coding unrelated to data): respond in 1 sentence, then say: "Hugh is built specifically for data and analytics learning — let's stay focused on ${topic}. What would you like to explore?"

Set isOffTopic to true only when the question has no meaningful connection to data, analytics, or technology.

Always respond with ONLY valid JSON, no markdown fences, no commentary:
{"reply": "...", "isOffTopic": true | false}`;
}

// ── Milestone curriculum generation ──────────────────────────────────────

export function milestoneGenerationPrompt(topic: string): string {
  return `You are an expert curriculum designer and learning coach.

The user wants to learn: "${topic}"

Generate a comprehensive, logically ordered list of 8–14 learning milestones that cover this topic from foundational concepts to practical mastery.

Requirements:
- Progress from fundamentals to advanced/applied topics in a logical order
- Each milestone must be a discrete, achievable learning unit
- Titles: short and specific (3–7 words). Examples: "Core Architecture & Components", "Writing Your First DAG", "Task Dependencies & XComs"
- Summaries: 2–3 sentences explaining what this milestone covers, why it matters, and what the learner will be able to do after completing it
- The first 1–2 milestones should start in column "learn" (the entry point); all others start in "backlog"

Respond with ONLY valid JSON, no markdown fences, no commentary:
{
  "trackTitle": "...",
  "milestones": [
    { "title": "...", "summary": "...", "column": "learn" },
    { "title": "...", "summary": "...", "column": "backlog" }
  ]
}`;
}

// ── Learning points (the "things to understand" checklist) ───────────────

export function learningPointsPrompt(
  topic:            string,
  milestoneTitle:   string,
  milestoneSummary: string,
): string {
  return `You are an expert curriculum designer.

The learner is studying "${topic}". This specific milestone is:
Title: "${milestoneTitle}"
Summary: "${milestoneSummary}"

Break this milestone's goal into a short, enumerated checklist of the key ideas the learner must understand to have genuinely accomplished it. These are the concrete "things to understand" — the concepts, mechanisms, or skills that together mean the goal is met.

Rules:
- 4 to 6 points, ordered from foundational to applied
- Each point: one specific idea, 4–12 words, no trailing punctuation
- Concrete and checkable (e.g. "How watermarking handles late-arriving events"), not vague ("Understand streaming")

Respond with ONLY valid JSON, no markdown fences:
{"points": ["...", "...", "..."]}`;
}

// ── Diary entry fact-check ────────────────────────────────────────────────

export function factCheckEntryPrompt(
  topic:          string,
  milestoneTitle: string,
  entryBody:      string,
): string {
  return `You are Hugh, a precise but supportive learning coach. A learner wrote a diary note while studying "${topic}" (milestone: "${milestoneTitle}"). Check it for factual or conceptual errors.

Learner's note:
"""
${entryBody.slice(0, 2000)}
"""

Judge ONLY clear factual or conceptual mistakes about the subject. Personal reflections, opinions, questions, learning goals, or notes that are correct-but-incomplete are NOT errors — mark those "correct".

If there is a genuine error:
- status: "incorrect"
- correction: a rewritten version of their note that fixes the error while keeping their voice and intent. Keep it roughly the same length.
- gap: one short sentence naming the specific misunderstanding (e.g. "You treated a CTE as if it were materialised like a temp table — it isn't by default."). This is shown to the learner as a permanent note of where their understanding was off.

If there is no error: status "correct", and set correction and gap to null.

Respond with ONLY valid JSON, no markdown fences:
{"status": "correct" | "incorrect", "correction": "..." | null, "gap": "..." | null}`;
}

// ── Backlog priority (agentic build order, one-time at generation) ────────

export function backlogPriorityPrompt(
  topic: string,
  items: Array<{ n: number; title: string; summary: string }>,
): string {
  return `You are an expert curriculum architect. A learner wants to learn: "${topic}".

Below are the backlog learning milestones for this goal. Reason about their conceptual dependencies and pedagogy, then put them in the best build order — what genuinely must be understood before what, so each milestone builds on the ones before it. Use real judgment about prerequisites, not a fixed formula.

Milestones:
${items.map(it => `${it.n}. ${it.title} — ${it.summary}`).join("\n")}

Return ALL of them in recommended study order (first = study first). For each, give a one-line reason (max ~15 words) for its placement relative to the others.

Respond with ONLY valid JSON, no markdown fences:
{"ordered": [{"n": <milestone number>, "reason": "..."}]}`;
}

// ── Mastery summary document (markdown "what you learned") ────────────────

export function masterySummaryPrompt(params: {
  topic:            string;
  milestoneTitle:   string;
  milestoneSummary: string;
  points:           Array<{ text: string; covered: boolean }>;
  diaryEntries:     Array<{ title: string | null; body: string; gap: string | null }>;
  masteryScore:     number | null;
  masteryFeedback:  string | null;
}): string {
  const { topic, milestoneTitle, milestoneSummary, points, diaryEntries, masteryScore, masteryFeedback } = params;

  const pointsBlock = points.length > 0
    ? points.map(p => `- [${p.covered ? "covered" : "partial"}] ${p.text}`).join("\n")
    : "(no checklist available)";

  const diaryBlock = diaryEntries.length > 0
    ? diaryEntries
        .map((e, i) => `[Note ${i + 1}]${e.title ? ` ${e.title}` : ""}\n${e.body}${e.gap ? `\n(Gap previously noted: ${e.gap})` : ""}`)
        .join("\n\n")
    : "(no diary entries)";

  const masteryBlock = masteryScore != null
    ? `Mastery score: ${masteryScore}/10.${masteryFeedback ? ` Hugh's verdict: ${masteryFeedback}` : ""}`
    : "(mastery not yet scored)";

  return `You are Hugh, a supportive learning coach. Write a concise, well-structured "what you learned" summary document for a learner who has just mastered a milestone. It should read like a keepsake they can revisit — celebratory but substantive, grounded ONLY in the material below (do not invent facts they didn't engage with).

Subject area: "${topic}"
Milestone: "${milestoneTitle}"
What the milestone covers: ${milestoneSummary}

Key ideas checklist (coverage from their activity):
${pointsBlock}

The learner's own diary notes for this milestone:
"""
${diaryBlock}
"""

${masteryBlock}

Write the document in GitHub-flavoured Markdown with this structure:
- A top-level heading: the milestone title.
- A short 1-2 sentence intro framing what they set out to learn.
- "## What you now understand" — 3-6 bullet points synthesising the key ideas they genuinely engaged with (draw from their notes and the covered checklist items). Be specific.
- "## In your own words" — 1-2 short paragraphs weaving their diary insights into a coherent narrative.
- If any gaps were noted, a "## Watch-outs" section listing them briefly as things to keep sharp.
- "## Mastery" — one sentence noting they professed this verbally${masteryScore != null ? " and their score" : ""}.

Keep it under ~350 words. Warm, clear, second person ("you"). Respond with ONLY the markdown document — no code fences, no preamble.`;
}

// ── Learning goal refinement (5-whys) ────────────────────────────────────

export function refinementQuestionPrompt(
  topic:   string,
  answers: Array<{ question: string; answer: string }>,
): string {
  const historyBlock =
    answers.length > 0
      ? `\n\nPrevious Q&A:\n${answers.map(a => `Q: "${a.question}"\nA: "${a.answer}"`).join("\n")}`
      : "";

  const questionNumber = answers.length + 1;
  const isLast         = answers.length >= 4;

  return `You are Hugh, a warm learning coach helping someone clarify their data and analytics learning goal. Hugh specialises in data engineering, data science, machine learning, SQL, analytics, databases, Python for data, and related data tooling.

Topic: "${topic}"${historyBlock}

This is question ${questionNumber} of 5. ${isLast ? "This is the final question — wrap up your understanding." : "Dig one level deeper with each question."}

Ask ONE focused follow-up question to understand their real motivation, context, or background within the data domain. Use the 5-Whys method — alternate between "why", "what", "how", and "tell me more about".

Rules:
- ONE question only, 20 words max
- Warm and conversational, not clinical
- Never repeat a question already asked
- If the topic is unrelated to data or analytics, set "done" to true and ask a gentle redirect question
- Set "done" to ${isLast ? "true" : "false"}

Respond with ONLY valid JSON, no markdown fences:
{"question": "...", "done": ${isLast}}`;
}

export function refineTopicPrompt(
  topic:   string,
  answers: Array<{ question: string; answer: string }>,
): string {
  const qa = answers
    .map(a => `Q: ${a.question}\nA: ${a.answer}`)
    .join("\n\n");

  return `A user wants to learn "${topic}". Here is what they shared about their motivation and context:

${qa}

Based on this:
1. Write a refined, specific topic title (5-10 words) that captures what they REALLY want to learn — more precise than the original.
2. Write three short expert tips (1-2 sentences each) about how to learn this subject effectively. Make them specific to the refined topic, practical, and encouraging.

Respond with ONLY valid JSON, no markdown fences:
{"refinedTopic": "...", "tips": ["...", "...", "..."]}`;
}

// ── Shared JSON parse helper ──────────────────────────────────────────────

export function parseClaudeJson<T = Record<string, unknown>>(text: string): T {
  // Strip markdown code fences if Claude wraps the output
  const cleaned = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

// Strip paired markdown emphasis (*italic* / **bold**) from text that is read
// aloud or rendered as plain text, where stray markers show literally. A lone
// unpaired "*" (e.g. "SELECT *") is left intact.
export function stripEmphasis(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}
