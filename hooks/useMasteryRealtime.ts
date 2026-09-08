'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MasteryRealtimeSession } from '@/lib/mastery/realtimeSession';
import { followupCapReached } from '@/lib/mastery/caps';
import { isEmpty } from '@/lib/mastery/realtimeUsage';
import type {
  MasteryRealtimeStatus,
  MasteryRealtimeError,
  MasteryRealtimeCredentials,
  MasteryTranscriptTurn,
  MasteryEndReason,
} from '@/types';

interface UseMasteryRealtimeReturn {
  status:     MasteryRealtimeStatus;
  error:      MasteryRealtimeError | null;
  transcript: MasteryTranscriptTurn[];
  endReason:  MasteryEndReason | null;   // set once the session concludes
  connect:    (milestoneId: string) => Promise<boolean>;
  endByUser:  () => void;
  disconnect: () => void;
}

export function useMasteryRealtime(): UseMasteryRealtimeReturn {
  const [status,     setStatus]     = useState<MasteryRealtimeStatus>('idle');
  const [error,      setError]      = useState<MasteryRealtimeError | null>(null);
  const [transcript, setTranscript] = useState<MasteryTranscriptTurn[]>([]);
  const [endReason,  setEndReason]  = useState<MasteryEndReason | null>(null);

  const sessionRef   = useRef<MasteryRealtimeSession | null>(null);
  const maxTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coachTurnsRef = useRef(0);
  const maxFollowupsRef = useRef(6);
  const inactivityMsRef = useRef(90_000);
  const endedRef = useRef(false); // single-evaluation guard

  // Reporting what the session spent. The server minted a credential and never
  // saw the call, so these two refs carry the only record of it: which card the
  // spend belongs to, and whether it has already been sent. Without the second,
  // the end-of-session report and the unload beacon would both fire and one
  // conversation would be billed twice.
  const milestoneIdRef = useRef<string | null>(null);
  const reportedRef    = useRef(false);

  /**
   * Send the session's token usage to the server. At most once per session.
   *
   * `useBeacon` is for teardown paths (unload, unmount) where a normal fetch
   * can be cancelled as the page goes away.
   *
   * Failures are swallowed on purpose: this is accounting riding on the
   * learner's session, and it must never break the thing it measures. A report
   * that never arrives is a known, documented gap — spend lost because the
   * laptop closed cannot be recovered from the client.
   */
  const reportUsage = useCallback((useBeacon: boolean) => {
    if (reportedRef.current) return;

    const session     = sessionRef.current;
    const milestoneId = milestoneIdRef.current;
    if (!session || !milestoneId) return;

    const usage = session.getUsage();
    reportedRef.current = true;

    // Nothing observed: no row to write. Silence is correct here — this is the
    // page that opened and never connected.
    if (isEmpty(usage)) return;

    const body = JSON.stringify({ milestoneId, usage });
    const url  = '/api/tracker/mastery/realtime-usage';

    try {
      if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }
      void fetch(url, {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* see doc comment — accounting must not surface here */ });
    } catch {
      /* same */
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (maxTimerRef.current)  { clearTimeout(maxTimerRef.current);  maxTimerRef.current  = null; }
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
  }, []);

  // Single, idempotent end path. First reason wins; further triggers are ignored.
  const endSession = useCallback((reason: MasteryEndReason) => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearTimers();
    // getUsage() deliberately survives dispose(), so the order of these two is
    // not load-bearing — only that both happen on every end path.
    reportUsage(false);
    sessionRef.current?.dispose();
    setEndReason(reason);
    setStatus('concluding');
  }, [clearTimers, reportUsage]);

  const bumpIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => endSession('inactivity'), inactivityMsRef.current);
  }, [endSession]);

  const disconnect = useCallback(() => {
    clearTimers();
    // Covers the paths that never reach endSession: unmount mid-conversation,
    // and starting a second session over a first. The guard inside makes the
    // second of two calls a no-op.
    reportUsage(true);
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, [clearTimers, reportUsage]);

  const connect = useCallback(async (milestoneId: string): Promise<boolean> => {
    disconnect();
    // A fresh session: new card, and its spend has not been reported yet.
    milestoneIdRef.current = milestoneId;
    reportedRef.current    = false;
    endedRef.current = false;
    coachTurnsRef.current = 0;
    setError(null);
    setEndReason(null);
    setTranscript([]);
    setStatus('connecting');

    let creds: MasteryRealtimeCredentials;
    try {
      const res = await fetch('/api/tracker/mastery/realtime-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ milestoneId }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus('error');
        setError({ kind: 'connection', message: b.error ?? `Could not start the session (${res.status}).` });
        return false;
      }
      creds = (await res.json()) as MasteryRealtimeCredentials;
    } catch {
      setStatus('error');
      setError({ kind: 'connection', message: 'Could not reach the realtime session service.' });
      return false;
    }

    maxFollowupsRef.current = creds.maxFollowups;
    inactivityMsRef.current = creds.inactivityMs;

    const session = new MasteryRealtimeSession({
      onStatus: (s) => { if (sessionRef.current === session) setStatus(s); },
      onError:  (e) => { if (sessionRef.current === session) setError(e); },
      onTranscript: (t) => {
        if (sessionRef.current !== session) return;
        setTranscript(t);
        bumpIdle();
      },
      onCoachTurn: () => {
        if (sessionRef.current !== session) return;
        coachTurnsRef.current += 1;
        if (followupCapReached(coachTurnsRef.current, maxFollowupsRef.current)) {
          endSession('max_followups');
        }
      },
      onConclude: () => {
        if (sessionRef.current === session) endSession('coach_concluded');
      },
    });
    sessionRef.current = session;

    await session.connect(creds);
    if (sessionRef.current !== session) return false;

    maxTimerRef.current = setTimeout(() => endSession('max_duration'), creds.maxSessionSeconds * 1000);
    bumpIdle();

    return session.getStatus() !== 'error';
  }, [disconnect, bumpIdle, endSession]);

  const endByUser = useCallback(() => endSession('user_ended'), [endSession]);

  useEffect(() => {
    const onUnload = () => disconnect();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      disconnect();
    };
  }, [disconnect]);

  return { status, error, transcript, endReason, connect, endByUser, disconnect };
}
