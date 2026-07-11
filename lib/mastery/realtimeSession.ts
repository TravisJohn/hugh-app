// ── Realtime mastery transport (browser, framework-agnostic) ────────────────
// Owns one WebRTC session for the mastery coach: mic capture, remote audio,
// the `oai-events` data channel, and the events the mastery flow needs. The
// coach DRIVES the conversation (create_response:true); this transport only
// observes — it never scores or persists.
//
// Guarantees:
//   • conclude_assessment is idempotent — only the FIRST valid call fires
//     onConclude; a fabricated "score" in the tool args is ignored (the coach
//     cannot inject a result).
//   • Events after dispose() can never fire callbacks (disposed guard).
//   • Transcript turns are deduped by id and finalised in arrival order.
//
// The event handler `ingestEvent` is deliberately callable in isolation so the
// idempotency / dedup logic can be unit-tested without a live connection.

import type {
  MasteryRealtimeStatus,
  MasteryRealtimeError,
  MasteryRealtimeCredentials,
  MasteryTranscriptTurn,
} from "@/types";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export interface MasteryRealtimeCallbacks {
  onStatus:     (status: MasteryRealtimeStatus) => void;
  onError:      (error: MasteryRealtimeError) => void;
  onTranscript: (turns: MasteryTranscriptTurn[]) => void;
  onCoachTurn:  () => void;              // a coach spoken turn completed
  onConclude:   (reason: string) => void; // fired at most once
}

interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export class MasteryRealtimeSession {
  private pc:        RTCPeerConnection | null = null;
  private dc:        RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private audioEl:   HTMLAudioElement | null = null;

  private disposed = false;
  private concludedOnce = false;
  private status: MasteryRealtimeStatus = "idle";

  private firstAudioForResponse = false;

  // Ordered transcript with id-based dedup.
  private turns: MasteryTranscriptTurn[] = [];
  private seenKeys = new Set<string>();

  private creds: MasteryRealtimeCredentials | null = null;

  constructor(private readonly cb: MasteryRealtimeCallbacks) {}

  getStatus(): MasteryRealtimeStatus { return this.status; }
  getTranscript(): MasteryTranscriptTurn[] { return [...this.turns]; }

  private setStatus(next: MasteryRealtimeStatus): void {
    if (this.disposed) return;
    this.status = next;
    this.cb.onStatus(next);
  }

  private fail(kind: MasteryRealtimeError["kind"], message: string): void {
    if (this.disposed) return;
    this.status = "error";
    this.cb.onStatus("error");
    this.cb.onError({ kind, message });
  }

  // ── Connection ────────────────────────────────────────────────────────────
  async connect(creds: MasteryRealtimeCredentials): Promise<void> {
    if (this.disposed) return;
    if (!isSupported()) {
      this.fail("unsupported", "This browser does not support the realtime voice connection.");
      return;
    }
    this.creds = creds;
    this.setStatus("connecting");

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.fail("mic_permission", "Microphone access is required for the mastery session.");
      return;
    }
    if (this.disposed) return;

    try {
      const pc = new RTCPeerConnection();
      this.pc = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      this.audioEl = audioEl;

      pc.ontrack = (e) => {
        if (this.disposed) return;
        if (this.audioEl) this.audioEl.srcObject = e.streams[0];
      };

      const micTrack = this.micStream.getAudioTracks()[0];
      if (micTrack) pc.addTrack(micTrack, this.micStream);

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onopen = () => this.onDataChannelOpen();
      dc.onmessage = (ev) => {
        if (this.disposed) return;
        try { this.ingestEvent(JSON.parse(ev.data as string) as ServerEvent); }
        catch { /* ignore non-JSON */ }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.disposed) return;

      const sdpRes = await fetch(
        `${REALTIME_CALLS_URL}?model=${encodeURIComponent(creds.model)}`,
        {
          method:  "POST",
          body:    offer.sdp,
          headers: { Authorization: `Bearer ${creds.clientSecret}`, "Content-Type": "application/sdp" },
        },
      );
      if (this.disposed) return;
      if (!sdpRes.ok) {
        this.fail("connection", `Realtime handshake failed (${sdpRes.status}).`);
        return;
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      if (this.disposed) return;

      this.setStatus("listening"); // connected; coach will open shortly
    } catch (err) {
      console.error("[mastery-realtime] connect error:", err);
      this.fail("connection", "Could not establish the realtime voice connection.");
    }
  }

  private onDataChannelOpen(): void {
    if (this.disposed || !this.creds) return;
    // Re-assert the critical settings (belt-and-braces) using the SAME values the
    // session was minted with: the noise-robust turn detection and pinned
    // transcription language. Tools/instructions are already set at mint time.
    this.send({
      type: "session.update",
      session: {
        audio: {
          input: {
            transcription:  { model: this.creds.transcriptionModel, language: this.creds.transcriptionLanguage },
            turn_detection: this.creds.turnDetection,
          },
          output: { voice: this.creds.voice },
        },
      },
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (this.disposed) return;
    if (this.dc && this.dc.readyState === "open") this.dc.send(JSON.stringify(payload));
  }

  private recordTurn(role: "coach" | "learner", key: string, text: string): void {
    const clean = text.trim();
    if (!clean || this.seenKeys.has(key)) return;
    this.seenKeys.add(key);
    this.turns.push({ role, text: clean });
    this.cb.onTranscript(this.getTranscript());
  }

  // ── Core event handler (testable in isolation) ──────────────────────────────
  ingestEvent(msg: ServerEvent): void {
    if (this.disposed) return;

    switch (msg.type) {
      case "input_audio_buffer.speech_started":
        this.setStatus("listening");
        break;

      case "response.created":
        this.firstAudioForResponse = false;
        this.setStatus("thinking");
        break;

      case "response.output_audio.delta":
        if (!this.firstAudioForResponse) {
          this.firstAudioForResponse = true;
          this.setStatus("coach_speaking");
        }
        break;

      // Learner's finalised speech for one item.
      case "conversation.item.input_audio_transcription.completed": {
        const key  = typeof msg.item_id === "string" ? msg.item_id : `learner-${this.turns.length}`;
        const text = typeof msg.transcript === "string" ? msg.transcript : "";
        this.recordTurn("learner", key, text);
        break;
      }

      // Coach's finalised spoken turn.
      case "response.output_audio_transcript.done": {
        const key  = typeof msg.item_id === "string" ? msg.item_id
                   : (typeof msg.response_id === "string" ? msg.response_id : `coach-${this.turns.length}`);
        const text = typeof msg.transcript === "string" ? msg.transcript : "";
        if (text.trim()) {
          this.recordTurn("coach", key, text);
          this.cb.onCoachTurn();
        }
        break;
      }

      // The coach signalled it has enough evidence.
      case "response.output_item.done": {
        const item = msg.item as { type?: string; name?: string; arguments?: string } | undefined;
        if (item?.type === "function_call" && item.name === "conclude_assessment") {
          this.handleConclude(item.arguments);
        }
        break;
      }
      case "response.function_call_arguments.done": {
        // Fallback signal for the same tool call. Treat as a conclusion when it's
        // the conclude tool (or when the event omits a name). handleConclude is
        // idempotent, so a duplicate with response.output_item.done is harmless.
        if (msg.name === "conclude_assessment" || typeof msg.name === "undefined") {
          this.handleConclude(typeof msg.arguments === "string" ? msg.arguments : undefined);
        }
        break;
      }

      case "response.done":
        if (!this.concludedOnce && this.status !== "error") this.setStatus("listening");
        break;

      case "error":
        console.error("[mastery-realtime] server error:", JSON.stringify(msg.error ?? {}));
        break;

      default:
        break;
    }
  }

  // Idempotent: only the first valid conclusion is honoured. Any "score" the
  // model puts in the args is deliberately ignored — the app owns the result.
  private handleConclude(argsJson: string | undefined): void {
    if (this.disposed || this.concludedOnce) return;
    this.concludedOnce = true;

    let reason = "coach concluded";
    if (argsJson) {
      try {
        const parsed = JSON.parse(argsJson) as { reason?: unknown };
        if (typeof parsed.reason === "string" && parsed.reason.trim()) reason = parsed.reason.trim();
      } catch { /* keep default reason */ }
    }
    this.setStatus("concluding");
    this.cb.onConclude(reason);
  }

  // ── Teardown ────────────────────────────────────────────────────────────────
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    try { this.dc?.close(); } catch { /* ignore */ }
    this.dc = null;

    try {
      this.pc?.getSenders().forEach((s) => s.track?.stop());
      this.pc?.close();
    } catch { /* ignore */ }
    this.pc = null;

    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;

    if (this.audioEl) {
      try { this.audioEl.srcObject = null; this.audioEl.remove(); } catch { /* ignore */ }
      this.audioEl = null;
    }

    this.status = "disconnected";
  }
}
