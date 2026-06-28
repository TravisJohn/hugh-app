'use client';

import { useState, useRef, useCallback } from 'react';
import { useAudioPlayer }       from './useAudioPlayer';
import { useSpeechRecognition } from './useSpeechRecognition';
import { pauseSession, pauseSessionWithNotice, completeSession } from '@/app/actions/session';
import {
  InterviewState,
  type CoachingMode,
  type Room,
  type Question,
  type ClientPersona,
} from '@/types';

// ── Internal helpers ──────────────────────────────────────────────────────

function guardState(
  actual:   InterviewState,
  expected: InterviewState,
  action:   string,
): boolean {
  if (actual !== expected) {
    console.warn(
      `[useInterview] "${action}" called in state "${actual}" (expected "${expected}") — ignored.`,
    );
    return false;
  }
  return true;
}

function buildQuestion(
  data: { question: string; bestAnswer: string; questionId?: string },
  sessionId: string,
  questionType: 'intro' | 'domain',
  orderIndex: number,
): Question {
  return {
    id:            data.questionId ?? '',
    session_id:    sessionId,
    question_text: data.question,
    best_answer:   data.bestAnswer,
    question_type: questionType,
    order_index:   orderIndex,
    asked_at:      new Date().toISOString(),
  };
}

// ── API helpers ───────────────────────────────────────────────────────────

async function apiFetchQuestion(params: {
  sessionId:         string;
  room:              Room;
  questionType:      'intro' | 'domain';
  questionIndex:     number;
  previousQuestions: string[];
  topic?:            string;
  jobDescription?:   string;
}): Promise<{ question: string; bestAnswer: string; questionId?: string }> {
  const res = await fetch('/api/interview/generate-question', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`generate-question failed: ${res.status}`);
  return res.json() as Promise<{ question: string; bestAnswer: string; questionId?: string }>;
}

// Single submit call: the route judges alignment AND writes feedback together
// (formerly two calls — check-similarity then generate-feedback — that duplicated
// the question/bestAnswer/transcript context).
async function apiGenerateFeedback(params: {
  questionId?:      string;
  question:         string;
  bestAnswer:       string;
  transcript:       string;
  viewedHint:       boolean;
  viewedBestAnswer: boolean;
}): Promise<{ feedback: string; usedBestAnswer: boolean; alignmentScore: number }> {
  const res = await fetch('/api/interview/generate-feedback', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`generate-feedback failed: ${res.status}`);
  return res.json() as Promise<{ feedback: string; usedBestAnswer: boolean; alignmentScore: number }>;
}

async function apiFetchHint(params: {
  question:   string;
  room:       Room;
  questionId: string | undefined;
  topic?:     string;
}): Promise<{ hint: string }> {
  const res = await fetch('/api/interview/generate-hint', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`generate-hint failed: ${res.status}`);
  return res.json() as Promise<{ hint: string }>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useInterview() {
  // ── State ───────────────────────────────────────────────────────────────
  const [state,               setStatePrimitive]  = useState<InterviewState>(InterviewState.IDLE);
  const [sessionId,           setSessionId]       = useState<string | null>(null);
  const [room,                setRoom]            = useState<Room | null>(null);
  const [currentPersona,      setCurrentPersona]  = useState<ClientPersona | null>(null);
  const [currentQuestion,     setCurrentQuestion] = useState<Question | null>(null);
  const [bestAnswer,          setBestAnswer]      = useState<string | null>(null);
  const [feedback,            setFeedback]        = useState<string | null>(null);
  const [questionIndex,       setQuestionIndex]   = useState(0);
  const [previousQuestions,   setPreviousQuestions] = useState<string[]>([]);
  const [answeredCount,       setAnsweredCount]   = useState(0);
  const [error,               setError]           = useState<string | null>(null);

  // Hint
  const [hint,                setHint]            = useState<string | null>(null);
  const [isHintLoading,       setIsHintLoading]   = useState(false);
  const [viewedHint,          setViewedHint]      = useState(false);

  // Ideal answer panel
  const [viewedBestAnswer,           setViewedBestAnswer]          = useState(false);
  const [isIdealAnswerCollapsed,     setIsIdealAnswerCollapsed]     = useState(false);

  // Refs that mirror state for stale-closure safety in callbacks
  const stateRef          = useRef<InterviewState>(InterviewState.IDLE);
  const coachingModeRef   = useRef<CoachingMode>('active');
  const answeredCountRef  = useRef(0);
  const topicRef          = useRef<string | undefined>(undefined);
  const jobDescriptionRef = useRef<string | undefined>(undefined);
  const voiceEnabledRef   = useRef(true);

  const setState = useCallback((next: InterviewState) => {
    stateRef.current = next;
    setStatePrimitive(next);
  }, []);

  // ── Audio player ─────────────────────────────────────────────────────────
  const handleAudioEnded = useCallback(() => {
    if (stateRef.current === InterviewState.PLAYING_QUESTION) {
      setState(InterviewState.READY);
    }
  }, [setState]);

  const { play, stop, isPlaying, waveformDataRef } = useAudioPlayer({
    onEnded: handleAudioEnded,
  });

  // ── Speech recognition ───────────────────────────────────────────────────
  const {
    transcript,
    isRecording,
    isSupported: speechIsSupported,
    start:       startSpeech,
    stop:        stopSpeech,
    reset:       resetSpeech,
  } = useSpeechRecognition();

  // ── Per-question state reset ──────────────────────────────────────────────
  function resetQuestionState() {
    setHint(null);
    setIsHintLoading(false);
    setViewedHint(false);
    setViewedBestAnswer(false);
    setIsIdealAnswerCollapsed(false);
    setFeedback(null);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  const startSession = useCallback(async (
    sid:             string,
    r:               Room,
    persona:         ClientPersona,
    coachingMode:    CoachingMode,
    topic?:          string,
    jobDescription?: string,
    skipIntro?:      boolean,
    voiceEnabled?:   boolean,
  ): Promise<void> => {
    setError(null);
    setSessionId(sid);
    setRoom(r);
    setCurrentPersona(persona);
    answeredCountRef.current  = 0;
    setAnsweredCount(0);
    coachingModeRef.current   = coachingMode;
    topicRef.current          = topic;
    jobDescriptionRef.current = jobDescription;
    voiceEnabledRef.current   = voiceEnabled ?? true;
    resetQuestionState();

    const firstType  = skipIntro ? 'domain' : 'intro';
    const firstIndex = skipIntro ? 2 : 0;

    setQuestionIndex(firstIndex);
    setPreviousQuestions([]);

    try {
      const data = await apiFetchQuestion({
        sessionId:         sid,
        room:              r,
        questionType:      firstType,
        questionIndex:     firstIndex,
        previousQuestions: [],
        topic,
        jobDescription,
      });

      setCurrentQuestion(buildQuestion(data, sid, firstType, firstIndex));
      setBestAnswer(data.bestAnswer);

      if (voiceEnabledRef.current) {
        setState(InterviewState.PLAYING_QUESTION);
        await play(data.question, persona.id);
        // handleAudioEnded transitions to READY when audio finishes
      } else {
        setState(InterviewState.READY);
      }
    } catch (err) {
      console.error('[useInterview] startSession:', err);
      setError('Failed to start session. Please try again.');
      setState(InterviewState.IDLE);
    }
  }, [play, setState]);

  const requestHint = useCallback(async (): Promise<void> => {
    if (stateRef.current !== InterviewState.READY) return;
    if (isHintLoading) return;

    setIsHintLoading(true);
    try {
      const data = await apiFetchHint({
        question:   currentQuestion?.question_text ?? '',
        room:       room ?? 'data_engineering',
        questionId: currentQuestion?.id || undefined,
        topic:      topicRef.current,
      });
      setHint(data.hint);
      setViewedHint(true);
    } catch (err) {
      console.error('[useInterview] requestHint:', err);
    } finally {
      setIsHintLoading(false);
    }
  }, [currentQuestion, room, isHintLoading]);

  const revealIdealAnswer = useCallback((): void => {
    if (stateRef.current !== InterviewState.READY &&
        stateRef.current !== InterviewState.REVIEWING) return;
    setViewedBestAnswer(true);
    setIsIdealAnswerCollapsed(false);
  }, []);

  const toggleIdealAnswerCollapse = useCallback((): void => {
    setIsIdealAnswerCollapsed(prev => !prev);
  }, []);

  const startRecording = useCallback((): void => {
    if (!guardState(stateRef.current, InterviewState.READY, 'startRecording')) return;
    resetSpeech();
    setState(InterviewState.RECORDING);
    startSpeech();
    setIsIdealAnswerCollapsed(true);
  }, [startSpeech, resetSpeech, setState]);

  const stopRecording = useCallback((): void => {
    if (!guardState(stateRef.current, InterviewState.RECORDING, 'stopRecording')) return;
    stopSpeech();
    setState(InterviewState.REVIEWING);
    setIsIdealAnswerCollapsed(false);
  }, [stopSpeech, setState]);

  const submitAnswer = useCallback(async (editedTranscript: string): Promise<void> => {
    if (!guardState(stateRef.current, InterviewState.REVIEWING, 'submitAnswer')) return;
    if (!currentQuestion || !bestAnswer || !currentPersona || !sessionId || !room) return;

    setError(null);
    setState(InterviewState.SUBMITTING);

    try {
      // One call now both judges alignment and writes feedback (passive mode
      // stores it silently). usedBestAnswer is persisted server-side.
      const { feedback: feedbackText } = await apiGenerateFeedback({
        questionId:       currentQuestion.id || undefined,
        question:         currentQuestion.question_text,
        bestAnswer,
        transcript:       editedTranscript,
        viewedHint,
        viewedBestAnswer,
      });

      if (coachingModeRef.current === 'passive') {
        // Silent path: increment counter, load next question, no FEEDBACK state
        answeredCountRef.current += 1;
        setAnsweredCount(answeredCountRef.current);

        const updatedPrevious = [...previousQuestions, currentQuestion.question_text];
        const newIndex        = questionIndex + 1;
        const questionType    = newIndex < 2 ? 'intro' : 'domain';

        const nextData = await apiFetchQuestion({
          sessionId,
          room,
          questionType,
          questionIndex:     newIndex,
          previousQuestions: updatedPrevious,
          topic:             topicRef.current,
          jobDescription:    jobDescriptionRef.current,
        });

        setPreviousQuestions(updatedPrevious);
        setQuestionIndex(newIndex);
        setCurrentQuestion(buildQuestion(nextData, sessionId, questionType, newIndex));
        setBestAnswer(nextData.bestAnswer);
        resetQuestionState();

        if (voiceEnabledRef.current) {
          setState(InterviewState.PLAYING_QUESTION);
          await play(nextData.question, currentPersona.id);
        } else {
          setState(InterviewState.READY);
        }
      } else {
        // Active path: show feedback, play audio if voice enabled
        setFeedback(feedbackText);
        setState(InterviewState.FEEDBACK);
        if (voiceEnabledRef.current) {
          await play(feedbackText, currentPersona.id);
        }
        // Voice disabled: isPlaying stays false, action buttons appear immediately
      }
    } catch (err) {
      console.error('[useInterview] submitAnswer:', err);
      setError('Failed to process your answer. Please try again.');
      setState(InterviewState.REVIEWING);
    }
  }, [
    currentQuestion, bestAnswer, currentPersona, sessionId, room,
    viewedHint, viewedBestAnswer, previousQuestions, questionIndex,
    play, setState,
  ]);

  const nextQuestion = useCallback(async (): Promise<void> => {
    if (!guardState(stateRef.current, InterviewState.FEEDBACK, 'nextQuestion')) return;
    if (!sessionId || !room || !currentPersona || !currentQuestion) return;

    setError(null);

    const updatedPrevious = [...previousQuestions, currentQuestion.question_text];
    const newIndex        = questionIndex + 1;
    const questionType    = newIndex < 2 ? 'intro' : 'domain';

    try {
      const data = await apiFetchQuestion({
        sessionId,
        room,
        questionType,
        questionIndex:     newIndex,
        previousQuestions: updatedPrevious,
        topic:             topicRef.current,
        jobDescription:    jobDescriptionRef.current,
      });

      setPreviousQuestions(updatedPrevious);
      setQuestionIndex(newIndex);
      setCurrentQuestion(buildQuestion(data, sessionId, questionType, newIndex));
      setBestAnswer(data.bestAnswer);
      resetQuestionState();

      if (voiceEnabledRef.current) {
        setState(InterviewState.PLAYING_QUESTION);
        await play(data.question, currentPersona.id);
      } else {
        setState(InterviewState.READY);
      }
    } catch (err) {
      console.error('[useInterview] nextQuestion:', err);
      setError('Failed to load the next question. Please try again.');
    }
  }, [
    sessionId, room, currentPersona, currentQuestion,
    previousQuestions, questionIndex, play, setState,
  ]);

  const takeBreak = useCallback(async (): Promise<void> => {
    if (!sessionId || !room) return;
    stop();
    setState(InterviewState.BREAK);

    if (coachingModeRef.current === 'passive') {
      if (answeredCountRef.current >= 5) {
        await completeSession(sessionId, room);
      } else {
        await pauseSessionWithNotice(sessionId);
      }
    } else {
      await pauseSession(sessionId);
    }
  }, [sessionId, room, stop, setState]);

  const reRecord = useCallback((): void => {
    if (stateRef.current !== InterviewState.REVIEWING) return;
    resetSpeech();
    setState(InterviewState.READY);
    setIsIdealAnswerCollapsed(false);
  }, [resetSpeech, setState]);

  // ── Public surface ────────────────────────────────────────────────────────
  return {
    // Machine state
    state,
    // Session data
    currentQuestion,
    bestAnswer,
    feedback,
    currentPersona,
    questionIndex,
    answeredCount,
    error,
    // Hint
    hint,
    isHintLoading,
    viewedHint,
    // Ideal answer
    viewedBestAnswer,
    isIdealAnswerCollapsed,
    // From useSpeechRecognition
    transcript,
    isRecording,
    speechIsSupported,
    // From useAudioPlayer
    isPlaying,
    waveformDataRef,
    // Handlers
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
  };
}
