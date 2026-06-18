'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioPlayerOptions {
  onEnded: () => void;
}

interface UseAudioPlayerReturn {
  play: (text: string, personaId: string) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  // Ref — not state — to avoid 60 fps re-renders in parent. WaveformPlayer
  // reads this inside its own requestAnimationFrame loop.
  waveformDataRef: React.MutableRefObject<Uint8Array>;
}

// Silence level for 8-bit time-domain data: 128 = 0 amplitude (midpoint).
const SILENCE_LEVEL = 128;
const FFT_SIZE = 256; // → frequencyBinCount = 128

export function useAudioPlayer({ onEnded }: UseAudioPlayerOptions): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef       = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const animFrameRef    = useRef<number | null>(null);
  const waveformDataRef = useRef<Uint8Array>(new Uint8Array(FFT_SIZE / 2).fill(SILENCE_LEVEL));

  // Monotonically-increasing play ID. When stop() bumps the counter, any
  // pending onended handler sees a stale ID and does NOT fire onEnded().
  const playIdRef    = useRef(0);
  const onEndedRef   = useRef(onEnded);

  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    waveformDataRef.current.fill(SILENCE_LEVEL);
  }, []);

  const stop = useCallback(() => {
    playIdRef.current += 1; // invalidate any in-flight onended

    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      } catch {
        // Source may already be stopped — safe to ignore
      }
      sourceRef.current = null;
    }

    stopAnimation();
    setIsPlaying(false);
  }, [stopAnimation]);

  const play = useCallback(async (text: string, personaId: string): Promise<void> => {
    stop(); // halt current playback (bumps playId, no onEnded fires)

    const playId = (playIdRef.current += 1);

    const res = await fetch('/api/interview/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, personaId }),
    });

    if (!res.ok) {
      throw new Error(`TTS request failed: ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();

    // Create or reuse AudioContext
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // If another play() won the race, bail out
    if (playId !== playIdRef.current) return;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyserRef.current = analyser;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    sourceRef.current = source;

    // Waveform animation loop
    const frameData = new Uint8Array(analyser.frequencyBinCount);
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      analyser.getByteTimeDomainData(frameData);
      waveformDataRef.current.set(frameData);
    }
    animate();

    source.onended = () => {
      stopAnimation();
      if (playId === playIdRef.current) {
        setIsPlaying(false);
        onEndedRef.current();
      }
    };

    source.start();
    setIsPlaying(true);
    // Promise resolves here: audio is actively playing.
  }, [stop, stopAnimation]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stop();
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, [stop]);

  return { play, stop, isPlaying, waveformDataRef };
}
