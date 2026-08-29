"use client";

import { useState } from "react";
import { BookMarked, Sparkles, Loader2, AlertTriangle, Upload, FileText, ArrowRight } from "lucide-react";
import { type LearningGoal } from "@/types";
import { classifyTopic, type TopicDomainVerdict } from "@/lib/learn/topic-domain";
import { MAX_TOPIC_CHARS } from "@/lib/learn/topicInput";
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

  // Domain gate: judge the topic before building anything. `gate` holds the
  // kind reminder when the topic is out of Hugh's data & analytics domain.
  const [checking, setChecking] = useState(false);
  const [gate, setGate]         = useState<TopicDomainVerdict | null>(null);

  const today = todayStr();

  function resolvedEndDate(): string {
    if (!chip) return "";
    if (chip === "custom") return customDate;
    const c = CHIPS.find(c => c.id === chip)!;
    return addDays(c.days!);
  }

  const endDate    = resolvedEndDate();
  const canSubmit  = topic.trim().length > 0 && endDate.length > 0;

  async function handleFinalize() {
    if (!canSubmit || checking) return;
    setChecking(true);
    setGate(null);

    // Strict domain gate — block out-of-domain topics before any track is built.
    const verdict = await classifyTopic(topic.trim());
    setChecking(false);
    if (!verdict.inDomain) {
      setGate(verdict);
      return;
    }

    setPendingTopic(topic.trim());
    setPendingEndDate(endDate);
    setRefining(true);
  }

  function handleTopicChange(value: string) {
    setTopic(value);
    if (gate) setGate(null); // editing the topic clears the reminder
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void handleFinalize();
  }

  function handleGoalCreated(goal: LearningGoal) {
    setGoals(prev => [goal, ...prev]);
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

  function handleCancelRefinement() {
    setRefining(false);
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
              onGoalCreated={handleGoalCreated}
              onCancel={handleCancelRefinement}
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
                    type="text"
                    value={topic}
                    onChange={e => handleTopicChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={MAX_TOPIC_CHARS}
                    placeholder="e.g. Apache Airflow, dbt, SQL window functions, ML pipelines…"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />

                  {/* Out-of-domain reminder (strict data & analytics gate) */}
                  {gate && !gate.inDomain && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
                        <div className="space-y-2.5">
                          <p className="text-sm leading-relaxed text-slate-200">
                            {gate.message ||
                              "Hugh is built specifically for data & analytics skill prep — that topic sits outside this focus. Try a data-related angle."}
                          </p>
                          {gate.suggestions.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-slate-500">
                                Try a data angle
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {gate.suggestions.map(s => (
                                  <button
                                    key={s}
                                    onClick={() => handleTopicChange(s)}
                                    className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/20 transition-colors"
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
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
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-600">
                  I&apos;ll commit for
                </p>
                <div className="flex flex-wrap gap-2">
                  {CHIPS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setChip(c.id); if (c.id !== "custom") setCustomDate(""); }}
                      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors
                        ${chip === c.id
                          ? "border-amber-500 bg-amber-500/20 text-amber-300"
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
