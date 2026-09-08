/**
 * Did that write actually change a row?
 *
 * The trap this module exists for: a Supabase update or delete whose filter
 * matches nothing **does not fail**. It returns `error: null` and no data, and
 * a route that checks only the error concludes it worked. Row Level Security
 * denials look exactly the same from here — the row is simply not visible to
 * this client, so nothing matches, so nothing is written, so nothing is
 * reported. That is the quietest failure in the stack: the database was asked,
 * politely declined, and said nothing about it.
 *
 * `if (error)` is therefore necessary and not sufficient. To find out whether a
 * row moved you have to ask the write to hand one back — `.select(...)` on the
 * update — and then check that one arrived. This module is that check, written
 * once so no route has to remember the trap.
 *
 * Structurally typed rather than importing Postgrest's types, so it stays pure
 * and unit-testable beside the routes that use it (CLAUDE.md rule 7), and so it
 * reads the same whether the caller used `.single()` (an object, or null) or a
 * plain `.select()` (an array, possibly empty).
 */

/** The shape every Supabase write replies with, narrowed to what matters here. */
export interface WriteReply {
  error: { message: string } | null;
  data:  unknown;
}

export type WriteFailureReason =
  /** The database refused and said so. */
  | "rejected"
  /** The database agreed and changed nothing: no such row, or RLS hid it. */
  | "no-row";

export type WriteOutcome =
  | { ok: true }
  | { ok: false; reason: WriteFailureReason; message: string };

const NO_ROW_MESSAGE =
  "the write matched no rows — the record is missing, or not visible to this user";

/**
 * Read a write's reply honestly.
 *
 * Pass the result of an update or delete that was asked to return what it
 * touched. A reply with no data is a write that did not happen, and is reported
 * as such rather than as a success.
 */
export function writeOutcome(reply: WriteReply): WriteOutcome {
  if (reply.error) {
    return { ok: false, reason: "rejected", message: reply.error.message };
  }
  if (reply.data === null || reply.data === undefined) {
    return { ok: false, reason: "no-row", message: NO_ROW_MESSAGE };
  }
  if (Array.isArray(reply.data) && reply.data.length === 0) {
    return { ok: false, reason: "no-row", message: NO_ROW_MESSAGE };
  }
  return { ok: true };
}
