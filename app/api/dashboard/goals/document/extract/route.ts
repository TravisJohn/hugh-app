import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createClient } from "@/lib/supabase/server";
import { enforceUsageGate, logUsage } from "@/lib/usage";
import {
  documentTopicExtractionPrompt,
  parseDocumentTopicExtraction,
  type DocumentTopicExtraction,
} from "@/lib/claude/prompts";
import { judgeTopicDomain } from "@/lib/learn/topic-domain-server";
import { logSafeError } from "@/lib/observability/log";
import {
  extractDocumentText,
  EmptyExtractionError,
  UnsupportedDocumentTypeError,
} from "@/lib/documents/extract";
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES } from "@/lib/documents/limits";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model for this route — see CLAUDE.md "Model Selection". Kept in one place so
// the API call and the usage log can never disagree about what was billed.
const MODEL = "claude-sonnet-4-6";

// First half of the document-upload path (PRD-course-from-document.md §7.1):
// upload → extract text → derive a candidate topic → gate it → create the
// goal in 'awaiting_approval' so the learner can review before the second
// half (`approve`) fires actual track generation. Two Claude calls chained
// (topic extraction, then the domain gate) comfortably fit a normal request —
// no after() needed here, unlike generateTrack's milestone build.

/**
 * Extraction has no user context of its own, so it hands the token counts back
 * to the POST handler, which owns the userId and does the logging. Counts
 * accumulate across retries — a discarded attempt still costs money.
 */
async function extractCandidateTopic(
  documentText: string,
): Promise<{ candidate: DocumentTopicExtraction; tokensIn: number; tokensOut: number }> {
  let lastErr: unknown = null;
  let tokensIn  = 0;
  let tokensOut = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: 600,
        messages:   [{ role: "user", content: documentTopicExtractionPrompt(documentText) }],
      });
      tokensIn  += msg.usage.input_tokens;
      tokensOut += msg.usage.output_tokens;
      const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      return { candidate: parseDocumentTopicExtraction(text), tokensIn, tokensOut };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("topic extraction failed");
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usageGate = await enforceUsageGate(userId);
  if (usageGate) return usageGate;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file    = form.get("file");
  const endDate = String(form.get("end_date") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!endDate) return NextResponse.json({ error: "end_date is required" }, { status: 400 });

  if (!ALLOWED_DOCUMENT_MIME[file.type]) {
    return NextResponse.json({ error: "Only PDF, DOCX, or HTML files are supported." }, { status: 415 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "File is larger than 15 MB." }, { status: 413 });
  }

  let extracted;
  try {
    extracted = await extractDocumentText(file);
  } catch (err) {
    if (err instanceof EmptyExtractionError) {
      return NextResponse.json(
        { error: "We couldn't find any text in that file — scanned or image-only documents aren't supported yet." },
        { status: 422 },
      );
    }
    if (err instanceof UnsupportedDocumentTypeError) {
      return NextResponse.json({ error: "Only PDF, DOCX, or HTML files are supported." }, { status: 415 });
    }
    logSafeError("goals/document/extract read", err, [file?.name ?? ""]);
    return NextResponse.json({ error: "Couldn't read that file." }, { status: 502 });
  }

  let candidate: DocumentTopicExtraction;
  try {
    const extraction = await extractCandidateTopic(extracted.text);
    candidate = extraction.candidate;
    void logUsage({
      userId,
      model:     MODEL,
      feature:   "dashboard/document-extract",
      tokensIn:  extraction.tokensIn,
      tokensOut: extraction.tokensOut,
    });
  } catch (err) {
    logSafeError("goals/document/extract topic", err, [extracted.text.slice(0, 200), file?.name ?? ""]);
    return NextResponse.json({ error: "Couldn't extract a topic from that document." }, { status: 502 });
  }

  // Domain gate (PRD §6 layer 3), reused in-process — same judge the typed-
  // topic path calls, just with no HTTP round-trip since we're already
  // server-side. Rejected verdicts return the same shape classify-topic
  // does, so any future client code can share one verdict-handling path.
  const verdict = await judgeTopicDomain(candidate.candidateTopic, userId);
  if (!verdict.inDomain) {
    return NextResponse.json(verdict);
  }

  const supabase = await createClient();

  const { data: goal, error: goalError } = await supabase
    .from("learning_goals")
    .insert({
      user_id:      userId,
      topic:        candidate.candidateTopic,
      end_date:     endDate,
      track_status: "awaiting_approval",
      source_kind:  "document",
    })
    .select("*")
    .single();

  if (goalError || !goal) {
    logSafeError("goals/document/extract db", goalError, [candidate.candidateTopic]);
    return NextResponse.json({ error: "Failed to save goal" }, { status: 500 });
  }

  const { error: extractionError } = await supabase
    .from("pending_document_extractions")
    .insert({
      goal_id:        goal.id as string,
      extracted_text: extracted.text,
      tips:           candidate.tips,
      source_format:  extracted.format,
    });

  if (extractionError) {
    logSafeError("goals/document/extract store", extractionError, [candidate.candidateTopic]);
    // Roll back — an 'awaiting_approval' goal with no pending extraction row
    // is a dead end the `approve` route can never complete.
    await supabase.from("learning_goals").delete().eq("id", goal.id as string);
    return NextResponse.json({ error: "Failed to save extracted document." }, { status: 500 });
  }

  return NextResponse.json({
    goal,
    candidateTopic: candidate.candidateTopic,
    tips:           candidate.tips,
    truncated:      extracted.truncated,
  });
}
