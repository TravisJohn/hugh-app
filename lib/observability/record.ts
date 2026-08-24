import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isOperationId,
  isOperationOutcome,
  type OperationId,
  type OperationOutcome,
} from "./operations";
import { sanitize, sanitizeDetail, errorClassOf } from "./sanitize";

// ── The writer ──────────────────────────────────────────────────────────────
//
// One row per attempt into `operation_events`.
//
// THE RULE THAT GOVERNS THIS FILE: observability must never break the thing it
// observes. Every failure here is swallowed and logged to the console.
//
// That is the exact inversion of the rule enforced across the Learn loop in
// f540684 — where an unchecked Supabase error was the bug — and this is the one
// place the inversion is correct. A telemetry write failing must not fail a
// learner's track build. Do not "fix" this by rethrowing.

// Mirrors the sentinel in lib/usage.ts, which is not exported. It is not a real
// auth.users row, so the foreign key would reject it — skip rather than emit a
// misleading error on every dev request.
const DEV_BYPASS_USER_ID = "dev-test-bypass";

export interface RecordOperationInput {
  userId:    string;
  operation: OperationId;
  outcome:   OperationOutcome;

  /** How long the attempt took. Omit when there was nothing to time. */
  durationMs?: number;

  /** Whatever was thrown. Its class and a sanitised message are stored. */
  error?: unknown;

  /**
   * Learner-supplied strings to strip from the error message — the topic, the
   * milestone title. The caller passes these because the caller is the only
   * thing that reliably knows which strings came from the learner.
   */
  redact?: readonly string[];

  /** Bounded context. Scrubbed to primitives; strings capped at 40 chars. */
  detail?: Record<string, unknown>;
}

/**
 * Record one attempt. Never throws, never rejects.
 *
 * Await this inside an `after()` block — a floating promise there can be cut
 * off when the invocation ends, which would lose exactly the rows that matter
 * most. In a normal request path `void` it, so telemetry adds no latency to
 * the learner's response.
 */
export async function recordOperation(input: RecordOperationInput): Promise<void> {
  try {
    const { userId, operation, outcome, durationMs, error, redact = [], detail } = input;

    // Defensive: the types say these are valid, but this is the last gate
    // before a string becomes a database key, and a typo'd id would write rows
    // that no panel ever renders.
    if (!isOperationId(operation)) {
      console.error(`[observability] refusing unknown operation "${operation}"`);
      return;
    }
    if (!isOperationOutcome(outcome)) {
      console.error(`[observability] refusing unknown outcome "${outcome}" for ${operation}`);
      return;
    }
    if (!userId || userId === DEV_BYPASS_USER_ID) return;

    const supabase = createServiceClient();

    const { error: insertError } = await supabase.from("operation_events").insert({
      user_id:     userId,
      operation,
      outcome,
      // Guard against a negative or non-finite clock delta reaching an INTEGER
      // column. A bad measurement should cost the duration, not the whole row.
      duration_ms: typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0
        ? Math.round(durationMs)
        : null,
      error_class: error === undefined ? null : errorClassOf(error),
      error_note:  error === undefined ? null : sanitize(error, redact),
      detail:      detail ? sanitizeDetail(detail, redact) : null,
    });

    if (insertError) {
      // Logged, not thrown. See the rule at the top of this file.
      console.error(`[observability] could not record ${operation}:`, insertError.message);
    }
  } catch (err) {
    // Catches everything the try block could not: a missing service-role key,
    // a network failure, a malformed input that slipped past the types.
    console.error("[observability] recordOperation threw and was swallowed:", err);
  }
}

/**
 * Time an operation and record whichever way it goes.
 *
 * Convenience for the common shape — start a clock, run the work, record `ok`
 * or `failed` — so a caller cannot accidentally record success on a path that
 * threw. The original error is always rethrown: this wrapper observes, it does
 * not handle.
 */
export async function recordTimed<T>(
  input: Omit<RecordOperationInput, "outcome" | "durationMs" | "error">,
  work:  () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await work();
    await recordOperation({ ...input, outcome: "ok", durationMs: Date.now() - startedAt });
    return result;
  } catch (err) {
    await recordOperation({
      ...input,
      outcome:    "failed",
      durationMs: Date.now() - startedAt,
      error:      err,
    });
    throw err;
  }
}
