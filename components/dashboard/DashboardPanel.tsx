"use client";

import { useRef, useState } from "react";
import { BookMarked, Sparkles, Loader2, Upload, FileText, ArrowRight } from "lucide-react";
import { type LearningGoal } from "@/types";
import { classifyTopic, mayProceed, type TopicDomainVerdict } from "@/lib/learn/topic-domain";
import TopicGateNotice from "./TopicGateNotice";
import { MAX_TOPIC_CHARS } from "@/lib/learn/topicInput";
import { recordAttempt } from "@/lib/learn/gateHistory";
import GoalCard from "./GoalCard";
import RefinementFlow from "./RefinementFlow";
import DocumentUploadFlow, { ACCEPT as DOCUMENT_ACCEPT } from "./DocumentUploadFlow";

type InputMode = "qa" | "document";

interface Props {
  initialGoals: LearningGoal[];
}

type DurationChip = "2w" | "1m" | "3m" | "custom";

const CHIPS: { id: DurationChip; label: string; days: number | null }[] = [
  { id: "2w",     label: "2 weeks",  days: 14 },
  { id: "1m",     label: "1 month",  days: 30 },
  { id: "3m",     label: "3 months", days: 90 },
  { id: "custom", label: "Custom",   days: null },
];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

export default function DashboardPanel({ initialGoals }: Props) {
  const [goals, setGoals]       = useState<LearningGoal[]>(initialGoals);
  const [topic, setTopic]       = useState("");
  const [chip, setChip]         = useState<DurationChip | null>(null);
  const [customDate, setCustomDate] = useState("");

  // Which input the idle "Add goal" form shows — a typed topic (Q&A
  // refinement) or a document upload. Only relevant when neither flow below
  // has been entered yet.
  const [inputMode, setInputMode] = useState<InputMode>("qa");

  // Refinement flow state
  const [refining, setRefining]       = useState(false);
  const [pendingTopic, setPendingTopic] = useState("");
  const [pendingEndDate, setPendingEndDate] = useState("");

  // Document upload flow state
  const [uploadingDoc, setUploadingDoc] = useState(false);
  // Picked in the idle panel, before "Continue" — carried into
  // DocumentUploadFlow as its initialFile so the user only picks once.
  const [docFile, setDocFile]     = useState<File | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Domain gate: judge the topic before building anything. `gate` holds any
  // verdict that stopped the build — either a request to pick a data angle
  // or the kind reminder that the topic is outside Hugh's domain.
  const [checking, setChecking] = useState(false);
  const [gate, setGate]         = useState<TopicDomainVerdict | null>(null);

  // Phrasings the gate has already asked this learner to narrow. Sent back on
  // the next call so a second try does not return the same three suggestions
  // they just turned down — the judge is stateless, and that is what makes a
  // gate feel like a loop. Never influences the verdict; see the prompt.
  const [attemptHistory, setAttemptHistory] = useState<string[]>([]);

  // True once the learner has taken up "I'll describe it". Holds the question
  // on screen while they type it out, which is otherwise dismissed by the first
  // keystroke.
  const [writingOwn, setWritingOwn] = useState(false);

  const topicRef = useRef<HTMLInputElement>(null);

  // What Hugh said on the way through. Empty for almost every topic; set when
  // the learner named a TOOL, where the gate passes them but wants them to know
  // Hugh teaches the thinking behind it rather than the product itself. Carried
  // into the refinement flow so it is read before any time is invested.
  const [lensNote, setLensNote] = useState("");

  const today = todayStr();

  function resolvedEndDate(): string {
    if (!chip) return "";
    if (chip === "custom") return customDate;
    const c = CHIPS.find(c => c.id === chip)!;
    return addDays(c.days!);
  }

  const endDate    = resolvedEndDate();
  const canSubmit  = topic.trim().length > 0 && endDate.length > 0;

  // The learner has done their part and only the date is outstanding. The
  // submit button is disabled in this state and says nothing about why, and
  // Enter silently does nothing — so the row that is actually missing has to
  // speak up itself, rather than leaving someone to guess which of the two
  // controls above it is the problem. Derived, not stored: it is a fact about
  // the form, and a second copy of it could go stale.
  const awaitingDate =
    endDate.length === 0 &&
    (inputMode === "qa" ? topic.trim().length > 0 : docFile !== null);

  async function handleFinalize() {
    if (!canSubmit || checking) return;
    const candidate = topic.trim();

    setChecking(true);
    setGate(null);
    setWritingOwn(false);

    // Strict domain gate — block out-of-domain topics before any track is built.
    // The history rides along so the judge can answer what they have already
    // tried; it is context for the reply, not for the verdict.
    const verdict = await classifyTopic(candidate, attemptHistory);
    setChecking(false);

    // recordAttempt decides what is worth carrying: only a 'needs_angle' is
    // remembered, so a declined topic never becomes context arguing for the
    // next one.
    setAttemptHistory(h => recordAttempt(h, candidate, verdict.verdict));

    if (!mayProceed(verdict)) {
      setGate(verdict);
      return;
    }

    setLensNote(verdict.message);
    setPendingTopic(candidate);
    setPendingEndDate(endDate);
    setRefining(true);
  }

  function handleTopicChange(value: string) {
    setTopic(value);
    // Editing normally dismisses the question. Not while the learner is writing
    // their own angle: the question is the thing they are answering, and taking
    // it off screen at the first keystroke is how you get a blank stare.
    if (gate && !writingOwn) setGate(null);
  }

  function handlePickSuggestion(suggestion: string) {
    setWritingOwn(false);
    setTopic(suggestion);
    setGate(null);
  }

  // "Something else — I'll describe it": hand them the field with the broad
  // topic selected, so typing replaces it and arrowing away still keeps it.
  function handleWriteOwn() {
    setWritingOwn(true);
    topicRef.current?.focus();
    topicRef.current?.select();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void handleFinalize();
  }

  function handleGoalCreated(goal: LearningGoal) {
    setGoals(prev => [goal, ...prev]);
    setAttemptHistory([]);
    setWritingOwn(false);
    setLensNote("");
    setRefining(false);
    setUploadingDoc(false);
    setInputMode("qa");
    setTopic("");
    setChip(null);
    setCustomDate("");
    setPendingTopic("");
    setPendingEndDate("");
    setDocFile(null);
    setPendingFile(null);
  }

  // Reset — the refinement flow's only way out, and deliberately a full one.
  // The answers a learner has given were drawn out by a topic they are now
  // abandoning, so keeping either half would hand them back a half-refined
  // goal they never asked for. Nothing is written until enterWaiting, so there
  // is no goal row to clean up: this is local state and the domain gate's
  // verdict, both cleared.
  function handleResetRefinement() {
    setRefining(false);
    setAttemptHistory([]);
    setWritingOwn(false);
    setLensNote("");
    setInputMode("qa");
    setTopic("");
    setChip(null);
    setCustomDate("");
    setPendingTopic("");
    setPendingEndDate("");
    setDocFile(null);
    setPendingFile(null);
    setGate(null);
  }

  function handleStartUpload() {
    if (!endDate || !docFile) return;
    setPendingEndDate(endDate);
    setPendingFile(docFile);
    setUploadingDoc(true);
  }

  function handleCancelUpload() {
    setUploadingDoc(false);
  }

  function handleGoalDeleted(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id));
  }

  return (
    <div className="flex flex-col gap-10 px-10 py-8 max-w-2xl w-full">

      {/* ── Add goal ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">
          What do you want to learn?
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {refining
            ? "Hugh is learning more about your goal to personalize your path."
            : uploadingDoc
            ? "Hugh is scoping a course around your document."
            : "Data, analytics, and everything in between — add a topic and set a commitment date."}
        </p>

        <div className="mt-5">
          {refining ? (
            <RefinementFlow
              topic={pendingTopic}
              endDate={pendingEndDate}
              lensNote={lensNote}
              onGoalCreated={handleGoalCreated}
              onReset={handleResetRefinement}
            />
          ) : uploadingDoc ? (
            <DocumentUploadFlow
              endDate={pendingEndDate}
              initialFile={pendingFile}
              onGoalCreated={handleGoalCreated}
              onCancel={handleCancelUpload}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {/* Input mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setInputMode("qa")}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors
                    ${inputMode === "qa"
                      ? "border-amber-500 bg-amber-500/20 text-amber-300"
                      : "border-slate-700 bg-slate-800 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                    }`}
                >
                  <Sparkles size={12} />
                  Answer a few questions
                </button>
                <button
                  onClick={() => setInputMode("document")}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors
                    ${inputMode === "document"
                      ? "border-amber-500 bg-amber-500/20 text-amber-300"
                      : "border-slate-700 bg-slate-800 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                    }`}
                >
                  <Upload size={12} />
                  Upload a document
                </button>
              </div>

              {inputMode === "qa" ? (
                <>
                  {/* Topic input */}
                  <input
                    ref={topicRef}
                    type="text"
                    value={topic}
                    onChange={e => handleTopicChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={MAX_TOPIC_CHARS}
                    placeholder="e.g. Statistics for data science, experiment design, dimensional modelling…"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />

                  {/* Topic gate: asks for an angle, or kindly declines. */}
                  {gate && (
                    <TopicGateNotice
                      verdict={gate}
                      onPickSuggestion={handlePickSuggestion}
                      onWriteOwn={handleWriteOwn}
                    />
                  )}
                </>
              ) : (
                <label
                  htmlFor="document-upload-input-panel"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-800/50 px-4 py-8 text-center hover:border-slate-500 transition-colors"
                >
                  {docFile ? (
                    <>
                      <FileText size={22} className="text-amber-400" />
                      <span className="text-sm text-slate-200">{docFile.name}</span>
                      <span className="text-xs text-slate-600">Click to choose a different file</span>
                    </>
                  ) : (
                    <>
                      <Upload size={22} className="text-slate-500" />
                      <span className="text-sm text-slate-300">Upload a PDF, DOCX, or HTML file</span>
                      <span className="text-xs text-slate-600">
                        A job description, syllabus, or textbook chapter works well
                      </span>
                    </>
                  )}
                  <input
                    id="document-upload-input-panel"
                    type="file"
                    accept={DOCUMENT_ACCEPT}
                    onChange={e => setDocFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              )}

              {/* Commitment chips — shared by both input modes */}
              <div>
                <p
                  className={`mb-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
                    awaitingDate ? "text-amber-400" : "text-slate-500"
                  }`}
                >
                  I&apos;ll commit for
                  {awaitingDate && (
                    <span className="ml-2 normal-case tracking-normal font-medium text-amber-400/80">
                      — pick one to continue
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {CHIPS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setChip(c.id); if (c.id !== "custom") setCustomDate(""); }}
                      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors
                        ${chip === c.id
                          ? "border-amber-500 bg-amber-500/20 text-amber-300"
                          : awaitingDate
                          ? "border-amber-500/40 bg-slate-800 text-slate-300 hover:border-amber-500 hover:text-amber-200"
                          : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                        }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {chip === "custom" && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    min={today}
                    className="mt-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                )}
              </div>

              {inputMode === "qa" ? (
                <button
                  onClick={handleFinalize}
                  disabled={!canSubmit || checking}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {checking ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Checking topic…
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Let&apos;s Discuss
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleStartUpload}
                  disabled={!endDate || !docFile}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Analyze document
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Library ────────────────────────────────────────────────── */}
      {goals.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookMarked size={15} className="text-slate-500" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              My learning library
            </h2>
            <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-600 font-mono">
              {goals.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {goals.map(g => <GoalCard key={g.id} goal={g} onDelete={handleGoalDeleted} />)}
          </div>
        </section>
      )}

      {goals.length === 0 && !refining && !uploadingDoc && (
        <p className="text-sm text-slate-700 italic">
          Your library is empty — add your first topic above.
        </p>
      )}
    </div>
  );
}
