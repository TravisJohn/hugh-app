import "server-only";

// ── The document-upload path, locked ─────────────────────────────────────────
//
// Uploading a document to scope a course is built and shipped, with a five-layer
// prompt-injection defence around it. It is switched OFF anyway, by product
// decision on 2026-09-09, until there is a settled answer to two questions the
// defence does not address:
//
//   What happens when a learner uploads a document containing information they
//   did not mean to send — a contract, a payslip, someone else's data? It goes
//   to a model, and its extracted text is stored.
//
//   And how much confidence is the right amount? The injection defence was
//   red-teamed and held, but "held against what we thought to try" is a
//   different claim from "safe to leave open".
//
// The lock is enforced on the SERVER, not by hiding a button. Both document
// routes refuse while it is off, because a check that only runs in the browser
// is not a check — those endpoints are reachable directly, which is exactly the
// argument the topic gate already makes about itself.
//
// To re-open it, set DOCUMENT_UPLOAD_ENABLED=true. Deliberately opt-in: a flag
// that defaults to on is a flag that turns itself on in the one environment
// nobody remembered to configure.

export function documentUploadEnabled(): boolean {
  return process.env.DOCUMENT_UPLOAD_ENABLED === "true";
}

/** The refusal both routes return, so they cannot drift into different words. */
export const DOCUMENT_UPLOAD_LOCKED_MESSAGE =
  "Building a course from a document is turned off for now. Type a topic instead — Hugh will ask a few questions and build the track from those.";
