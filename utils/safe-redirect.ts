/**
 * Guards against open-redirect / javascript: injection via user-controlled
 * `next`/`returnUrl` query params. Only a same-origin path (starting with a
 * single `/`, never `//`) is allowed through; anything else — an absolute
 * URL, `javascript:`, `data:`, a protocol-relative `//evil.example`, an
 * encoded variant, or a backslash form browsers normalize to `//` — falls
 * back to `fallback`.
 *
 * Used wherever a redirect target arrives from a query string, on both the
 * server (`redirect()`) and the client (`router.push()`).
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/home"
): string {
  if (!value) return fallback;

  // Decode first so an encoded `%2F%2Fevil.example` or `%5C` can't smuggle
  // past the same checks that run on the raw string.
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  // Browsers treat backslashes as forward slashes when resolving a URL, so
  // `/\evil.example` is a protocol-relative redirect in disguise.
  const normalized = decoded.replace(/\\/g, "/").trim();

  const isSameOriginPath = normalized.startsWith("/") && !normalized.startsWith("//");

  return isSameOriginPath ? normalized : fallback;
}
