'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// Full Web Speech API types live in types/speech.d.ts

interface UseSpeechRecognitionReturn {
  transcript:   string;
  isRecording:  boolean;
  isSupported:  boolean;
  start:        () => void;
  stop:         () => void;
  reset:        () => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [finalTranscript,   setFinalTranscript]   = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isRecording,       setIsRecording]       = useState(false);

  // Ref mirrors isRecording so onend/onerror handlers always see the latest
  // value without needing it as a dependency (avoids recreation on each render).
  const isRecordingRef  = useRef(false);
  const recognitionRef  = useRef<SpeechRecognition | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (!isSupported) {
      console.warn('[useSpeechRecognition] Web Speech API not supported — Chrome or Edge required.');
      return;
    }

    const Impl = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Impl) return;

    const recognition = new Impl();
    recognition.continuous    = true;
    recognition.interimResults = true;
    recognition.lang          = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let addedFinal   = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          addedFinal += result[0].transcript;
        } else {
          currentInterim += result[0].transcript;
        }
      }

      if (addedFinal) setFinalTranscript(prev => prev + addedFinal);
      setInterimTranscript(currentInterim);
    };

    // Some browsers stop recognition after a period of silence.
    // Restart automatically if we're still supposed to be recording.
    recognition.onend = () => {
      if (isRecordingRef.current) {
        try { recognition.start(); } catch { /* already started */ }
      } else {
        setInterimTranscript('');
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // no-speech and aborted are expected events, not real errors
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('[useSpeechRecognition] error:', event.error);
    };

    recognitionRef.current = recognition;

    return () => {
      isRecordingRef.current = false;
      recognition.abort();
    };
  }, [isSupported]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    isRecordingRef.current = true;
    setIsRecording(true);
    try { recognitionRef.current.start(); } catch { /* already started */ }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setInterimTranscript('');
    try { recognitionRef.current.stop(); } catch { /* already stopped */ }
  }, []);

  const reset = useCallback(() => {
    stop();
    setFinalTranscript('');
    setInterimTranscript('');
  }, [stop]);

  // While recording: show live transcript (final + interim in progress).
  // After stop: finalTranscript only (interimTranscript cleared on stop).
  const transcript = isRecording
    ? finalTranscript + interimTranscript
    : finalTranscript;

  return { transcript, isRecording, isSupported, start, stop, reset };
}
