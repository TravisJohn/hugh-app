import { describe, it, expect, vi } from "vitest";
import { MasteryRealtimeSession, type MasteryRealtimeCallbacks } from "./realtimeSession";
import { followupsUsed, followupCapReached } from "./caps";

function makeSession() {
  const cb: MasteryRealtimeCallbacks = {
    onStatus:     vi.fn(),
    onError:      vi.fn(),
    onTranscript: vi.fn(),
    onCoachTurn:  vi.fn(),
    onConclude:   vi.fn(),
  };
  return { session: new MasteryRealtimeSession(cb), cb };
}

const concludeItem = (args: string) => ({
  type: "response.output_item.done",
  item: { type: "function_call", name: "conclude_assessment", arguments: args },
});

describe("conclude_assessment idempotency", () => {
  it("fires onConclude only once even with duplicate conclusion events", () => {
    const { session, cb } = makeSession();
    session.ingestEvent(concludeItem('{"reason":"enough evidence"}'));
    session.ingestEvent(concludeItem('{"reason":"again"}'));
    session.ingestEvent({
      type: "response.function_call_arguments.done",
      name: "conclude_assessment",
      arguments: '{"reason":"third"}',
    });
    expect(cb.onConclude).toHaveBeenCalledTimes(1);
    expect(cb.onConclude).toHaveBeenCalledWith("enough evidence");
  });

  it("ignores any score/pass the model tries to inject — app owns the result", () => {
    const { session, cb } = makeSession();
    // A malicious/hallucinated tool call trying to set the outcome.
    session.ingestEvent(concludeItem('{"reason":"done","masteryScore":10,"passed":true}'));
    // onConclude receives ONLY a reason string — no score path exists.
    expect(cb.onConclude).toHaveBeenCalledTimes(1);
    expect(cb.onConclude).toHaveBeenCalledWith("done");
  });

  it("does not fire callbacks for events after dispose() (stale-event guard)", () => {
    const { session, cb } = makeSession();
    session.dispose();
    session.ingestEvent(concludeItem('{"reason":"late"}'));
    session.ingestEvent({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "x", transcript: "hello",
    });
    expect(cb.onConclude).not.toHaveBeenCalled();
    expect(cb.onTranscript).not.toHaveBeenCalled();
  });
});

describe("transcript accumulation", () => {
  it("dedupes turns by id and preserves arrival order", () => {
    const { session, cb } = makeSession();
    session.ingestEvent({ type: "response.output_audio_transcript.done", item_id: "c1", transcript: "Design the table?" });
    session.ingestEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "l1", transcript: "Partition by date." });
    // duplicate learner event with same id → ignored
    session.ingestEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "l1", transcript: "Partition by date." });

    const turns = session.getTranscript();
    expect(turns).toEqual([
      { role: "coach", text: "Design the table?" },
      { role: "learner", text: "Partition by date." },
    ]);
    expect(cb.onCoachTurn).toHaveBeenCalledTimes(1);
  });
});

describe("follow-up cap (app-owned hard limit)", () => {
  it("counts follow-ups excluding the opener", () => {
    expect(followupsUsed(1)).toBe(0);  // opener only
    expect(followupsUsed(4)).toBe(3);
  });

  it("reports the cap only once follow-ups reach the max", () => {
    expect(followupCapReached(6, 6)).toBe(false); // opener + 5 follow-ups
    expect(followupCapReached(7, 6)).toBe(true);  // opener + 6 follow-ups
  });
});

describe("usage observation", () => {
  it("records the coach model's tokens from response.done", () => {
    // The server never sees this call. If the transport does not capture the
    // figure here, the spend has no record anywhere.
    const { session } = makeSession();
    session.ingestEvent({
      type: "response.done",
      response: {
        usage: {
          input_tokens: 120,
          output_tokens: 80,
          input_token_details:  { audio_tokens: 110, text_tokens: 10 },
          output_token_details: { audio_tokens: 75,  text_tokens: 5  },
        },
      },
    });

    const usage = session.getUsage();
    expect(usage.audioIn).toBe(110);
    expect(usage.textIn).toBe(10);
    expect(usage.audioOut).toBe(75);
    expect(usage.textOut).toBe(5);
  });

  it("records transcription tokens, which response.done never reports", () => {
    // Two models, two events, two rates — conflating them mis-states the cost.
    const { session } = makeSession();
    session.ingestEvent({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-1",
      transcript: "I partitioned the table by date.",
      usage: { type: "tokens", input_tokens: 44, output_tokens: 9 },
    });

    const usage = session.getUsage();
    expect(usage.transcriptionIn).toBe(44);
    expect(usage.transcriptionOut).toBe(9);
    expect(usage.audioIn).toBe(0);
  });

  it("accumulates across a whole session rather than keeping only the last turn", () => {
    const { session } = makeSession();
    session.ingestEvent({ type: "response.done", response: { usage: { input_tokens: 10 } } });
    session.ingestEvent({ type: "response.done", response: { usage: { input_tokens: 15 } } });

    expect(session.getUsage().audioIn).toBe(25);
  });

  it("counts a response that arrives after the coach concluded", () => {
    // It still cost money. The status guard must not gate the accounting.
    const { session } = makeSession();
    session.ingestEvent(concludeItem('{"reason":"done"}'));
    session.ingestEvent({ type: "response.done", response: { usage: { input_tokens: 30 } } });

    expect(session.getUsage().audioIn).toBe(30);
  });

  it("survives dispose() so an ended session can still be billed", () => {
    // Every end path tears down the connection before the usage is read.
    const { session } = makeSession();
    session.ingestEvent({ type: "response.done", response: { usage: { input_tokens: 60 } } });
    session.dispose();

    expect(session.getUsage().audioIn).toBe(60);
  });

  it("tolerates a response.done carrying no usage at all", () => {
    const { session } = makeSession();
    session.ingestEvent({ type: "response.done", response: {} });
    session.ingestEvent({ type: "response.done" });

    expect(session.getUsage().audioIn).toBe(0);
  });
});
