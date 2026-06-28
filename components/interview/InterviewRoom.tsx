'use client';

import { useEffect, useRef, useState } from 'react';
import { useInterview }      from '@/hooks/useInterview';
import { InterviewState, type CoachingMode, type Room, type ClientPersona } from '@/types';
import PersonaBar            from './PersonaBar';
import QuestionZone          from './QuestionZone';
import ActionZone            from './ActionZone';
import WaveformPlayer        from './WaveformPlayer';
import HintPanel             from './HintPanel';
import IdealAnswerPanel      from './IdealAnswerPanel';
import LiveTranscript        from './LiveTranscript';
import MicButton             from './MicButton';
import TranscriptEditor      from './TranscriptEditor';
import FeedbackCard          from './FeedbackCard';
import SubmittingState       from './SubmittingState';

interface Props {
  sessionId:       string;
  room:            Room;
  persona:         ClientPersona;
  coachingMode:    CoachingMode;
  topic?:          string;
  jobDescription?: string;
  skipIntro?:      boolean;
  voiceEnabled?:   boolean;
}

function StopIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function InterviewRoom({ sessionId, room, persona, coachingMode, topic, jobDescription, skipIntro, voiceEnabled }: Props) {
  const isVoice = voiceEnabled ?? true;

  const {
    state,
    currentQuestion,
    bestAnswer,
    feedback,
    questionIndex,
    error,
    hint,
    isHintLoading,
    viewedBestAnswer,
    isIdealAnswerCollapsed,
    transcript,
    speechIsSupported,
    isPlaying,
    waveformDataRef,
    startSession,
    requestHint,
    revealIdealAnswer,
    toggleIdealAnswerCollapse,
    startRecording,
    stopRecording,
    submitAnswer,
    nextQuestion,
    takeBreak,
    reRecord,
  } = useInterview();

  // Strict Mode guard — prevent double-start in development. Runs once; the
  // session params are read at mount and intentionally not re-run dependencies.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startSession(sessionId, room, persona, coachingMode, topic, jobDescription, skipIntro, voiceEnabled);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSession, sessionId, room, persona]);

  // Mirror the editable transcript so ActionZone can call submitAnswer(reviewText)
  const [reviewText, setReviewText] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state === InterviewState.REVIEWING) setReviewText(transcript);
  }, [state, transcript]);

  const isLarge =
    state === InterviewState.PLAYING_QUESTION || state === InterviewState.READY;

  const showQuestion =
    currentQuestion != null && state !== InterviewState.IDLE;

  // ── Content zone per state ─────────────────────────────────────────────────
  function renderContentZone() {
    if (state === InterviewState.IDLE || !currentQuestion) {
      return (
        <div className="flex flex-1 min-h-0 items-center justify-center">
          <p className="animate-pulse text-sm text-slate-500">Preparing your session…</p>
        </div>
      );
    }

    switch (state) {
      case InterviewState.PLAYING_QUESTION:
        return (
          <div className="flex flex-1 min-h-0 items-center justify-center">
            {isVoice ? (
              <div className="w-full">
                <WaveformPlayer waveformDataRef={waveformDataRef} isPlaying={isPlaying} />
              </div>
            ) : (
              <p className="animate-pulse text-sm text-slate-500">Loading question…</p>
            )}
          </div>
        );

      case InterviewState.READY:
        return (
          <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto">
            {!speechIsSupported && (
              <p className="text-xs text-amber-400">
                Voice recording requires Chrome or Edge.
              </p>
            )}
            <HintPanel hint={hint} isLoading={isHintLoading} />
            {bestAnswer && (
              <IdealAnswerPanel
                bestAnswer={bestAnswer}
                isVisible={viewedBestAnswer}
                isCollapsed={isIdealAnswerCollapsed}
                onToggleCollapse={toggleIdealAnswerCollapse}
              />
            )}
          </div>
        );

      case InterviewState.RECORDING:
        return (
          <div className="flex flex-1 min-h-0 flex-col gap-4">
            {bestAnswer && viewedBestAnswer && (
              <div className="shrink-0">
                <IdealAnswerPanel
                  bestAnswer={bestAnswer}
                  isVisible={viewedBestAnswer}
                  isCollapsed={isIdealAnswerCollapsed}
                  onToggleCollapse={toggleIdealAnswerCollapse}
                />
              </div>
            )}
            <LiveTranscript transcript={transcript} />
          </div>
        );

      case InterviewState.REVIEWING:
        return (
          <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto">
            {bestAnswer && viewedBestAnswer && (
              <div className="shrink-0">
                <IdealAnswerPanel
                  bestAnswer={bestAnswer}
                  isVisible={viewedBestAnswer}
                  isCollapsed={isIdealAnswerCollapsed}
                  onToggleCollapse={toggleIdealAnswerCollapse}
                />
              </div>
            )}
            <TranscriptEditor
              initialTranscript={transcript}
              onChange={setReviewText}
            />
          </div>
        );

      case InterviewState.SUBMITTING:
        return <SubmittingState />;

      case InterviewState.FEEDBACK:
        if (!isVoice) {
          return (
            <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
              <p className="leading-relaxed text-slate-200">{feedback ?? ''}</p>
            </div>
          );
        }
        return (
          <FeedbackCard
            feedback={feedback ?? ''}
            isPlaying={isPlaying}
            waveformDataRef={waveformDataRef}
          />
        );

      case InterviewState.BREAK:
        return (
          <div className="flex flex-1 min-h-0 items-center justify-center">
            <p className="text-sm text-slate-500">Saving your session…</p>
          </div>
        );

      default:
        return null;
    }
  }

  // ── Action zone per state ──────────────────────────────────────────────────
  function renderActions() {
    if (!currentQuestion || state === InterviewState.IDLE || state === InterviewState.BREAK) {
      return null;
    }

    switch (state) {
      case InterviewState.PLAYING_QUESTION:
        return null;

      case InterviewState.READY:
        return (
          <div className="flex w-full items-center justify-between gap-4">
            <button
              onClick={() => void requestHint()}
              disabled={isHintLoading}
              className="h-12 rounded-lg border border-slate-600 bg-transparent px-6 text-sm text-slate-300 transition-colors hover:border-slate-400 hover:text-white disabled:opacity-50"
            >
              Hint
            </button>
            <button
              onClick={revealIdealAnswer}
              className="h-12 rounded-lg border border-slate-600 bg-transparent px-6 text-sm text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
            >
              Ideal Answer
            </button>
            <MicButton onClick={startRecording} />
          </div>
        );

      case InterviewState.RECORDING:
        return (
          <button
            onClick={stopRecording}
            className="flex h-12 items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-6 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
          >
            <StopIcon />
            Stop Recording
          </button>
        );

      case InterviewState.REVIEWING:
        return (
          <div className="flex w-full items-center justify-between gap-4">
            <button
              onClick={reRecord}
              className="h-12 rounded-lg border border-slate-600 px-6 text-sm text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
            >
              Re-record
            </button>
            <button
              onClick={() => submitAnswer(reviewText)}
              disabled={!reviewText.trim()}
              className="h-12 rounded-lg bg-[#38BDF8] px-8 font-semibold text-slate-900 transition-colors hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Submit Answer
            </button>
          </div>
        );

      case InterviewState.SUBMITTING:
        return null;

      case InterviewState.FEEDBACK:
        if (isPlaying) return null;
        return (
          <div className="flex items-center gap-4 transition-opacity duration-200">
            <button
              onClick={() => void takeBreak()}
              className="h-12 rounded-lg border border-slate-600 px-6 text-sm text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
            >
              Take a Break
            </button>
            <button
              onClick={nextQuestion}
              className="h-12 rounded-lg bg-[#38BDF8] px-8 font-semibold text-slate-900 transition-colors hover:bg-sky-300"
            >
              Next Question
            </button>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0F172A] text-white">
      <PersonaBar persona={persona} room={room} questionIndex={questionIndex} coachingMode={coachingMode} topic={topic} />

      {error && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-8 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden flex-col max-w-3xl mx-auto w-full px-8">
        {showQuestion && (
          <QuestionZone
            questionText={currentQuestion.question_text}
            isLarge={isLarge}
          />
        )}

        <div key={state} className="animate-fadeIn flex flex-1 min-h-0 overflow-y-auto flex-col">
          {renderContentZone()}
        </div>

        <ActionZone>
          {renderActions()}
        </ActionZone>
      </div>
    </div>
  );
}
