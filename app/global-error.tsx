"use client";

/**
 * The last line: this catches a throw in the root layout itself, which is the
 * one failure `app/error.tsx` cannot catch (that boundary renders *inside* the
 * layout that just died). It replaces the whole document, so it must supply its
 * own `<html>` and `<body>`.
 *
 * Deliberately duplicated rather than built from `ErrorScreen`, and styled with
 * inline styles rather than Tailwind. This is the one screen that renders when
 * the layout is broken — so it must not depend on the stylesheet, the fonts,
 * the icon package or the router, because any of those may be exactly what
 * failed. A DRY exception, taken on purpose: shared code here would be shared
 * risk. It is also why the exit is a plain `<a>` and not a `<Link>` — a full
 * document load is the recovery, not a client-side navigation.
 */

const PAGE: React.CSSProperties = {
  minHeight:       "100vh",
  display:         "flex",
  flexDirection:   "column",
  alignItems:      "center",
  justifyContent:  "center",
  gap:             "1.5rem",
  padding:         "0 1.5rem",
  backgroundColor: "#0F172A",
  color:           "#F1F5F9",
  fontFamily:      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  textAlign:       "center",
};

const BUTTON: React.CSSProperties = {
  padding:         "0.75rem 1.5rem",
  borderRadius:    "0.75rem",
  border:          "none",
  backgroundColor: "#0EA5E9",
  color:           "#FFFFFF",
  fontSize:        "0.875rem",
  fontWeight:      600,
  cursor:          "pointer",
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={PAGE}>
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            Hugh could not start
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", lineHeight: 1.6, color: "#94A3B8" }}>
            Something failed before the page could be built. Nothing you have
            saved is affected.
          </p>

          {error.digest && (
            <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#64748B" }}>
              Reference:{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#CBD5E1" }}>
                {error.digest}
              </span>
            </p>
          )}

          <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center" }}>
            <button type="button" onClick={reset} style={BUTTON}>
              Try again
            </button>
            {/* A hard document load, deliberately — if the layout is broken, a
                client-side navigation would re-mount the same broken tree. */}
            <a href="/home" style={{ fontSize: "0.75rem", color: "#475569", textDecoration: "none" }}>
              Back to your activities
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
