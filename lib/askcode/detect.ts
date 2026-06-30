// Code Mode trigger detection.
//
// This is the ONLY job the keyword does: it *gates* the request by flipping a
// `codeModeRequested` flag on the chat call. It deliberately does NOT decide
// whether code is actually appropriate — that judgement belongs to Hugh's
// response-generation (the chat model), so a request on a non-code topic gets a
// conversational decline instead of a fabricated snippet.

/**
 * True when a learner message is asking to enter code mode.
 *
 * Matches the phrase "code mode" anywhere in the message, case-insensitively and
 * tolerant of extra inner whitespace ("code   mode") and a leading slash
 * ("/code mode"). Kept intentionally loose: a false positive just asks Hugh
 * whether code helps, which he can decline — so erring toward catching the
 * intent is safe.
 */
export function isCodeModeRequest(text: string): boolean {
  if (!text) return false;
  // Collapse runs of whitespace so "code   mode" / "code\nmode" still match.
  const normalised = text.toLowerCase().replace(/\s+/g, " ");
  return /\bcode mode\b/.test(normalised);
}
