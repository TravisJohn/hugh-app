import { KANBAN_COLUMNS, KANBAN_COLUMN_LABELS } from "@/types";

/**
 * Instant loading state for a track board.
 *
 * The board is a dynamic route: it awaits `auth.getUser()`, a profiles lookup,
 * and the track + milestone queries before a single byte streams. Without this
 * Suspense fallback a client-side navigation to the board leaves the *previous*
 * screen on display for the whole round-trip, which reads as a dead button —
 * that was the reported bug on the review-quiz results screen.
 *
 * Deliberately card-shaped rather than a centred spinner: it occupies the same
 * layout the board will, so nothing jumps when the real data lands.
 */

// Placeholder card heights per column — fixed, not random, so the server and
// client render identical markup.
const CARD_HEIGHTS: Record<string, number[]> = {
  backlog: [56, 72, 56],
  learn:   [72, 56],
  review:  [56, 64],
  done:    [56, 56, 72],
};

export default function TrackBoardLoading() {
  return (
    <div
      role="status"
      aria-label="Loading board"
      className="flex h-screen flex-col overflow-hidden bg-[#0F172A]"
    >
      {/* Header — mirrors the real page header so it does not shift on load */}
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-800 px-6 py-4">
        <div className="h-5 w-20 animate-pulse rounded-lg bg-slate-800" />
        <span className="text-slate-700">/</span>
        <div className="h-4 w-64 animate-pulse rounded bg-slate-800" />
      </header>

      {/* Columns */}
      <div className="flex-1 overflow-hidden px-6 py-5">
        <div className="flex h-full gap-4">
          {KANBAN_COLUMNS.map(col => (
            <div key={col} className="flex h-full min-w-0 flex-1 flex-col">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-slate-700" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                  {KANBAN_COLUMN_LABELS[col]}
                </span>
              </div>

              <div className="flex-1 space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/30 p-2">
                {(CARD_HEIGHTS[col] ?? [56, 56]).map((h, i) => (
                  <div
                    key={i}
                    style={{ height: h }}
                    className="animate-pulse rounded-xl border border-slate-800 bg-slate-800/50"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading your board…</span>
    </div>
  );
}
