"use client";

import ErrorScreen from "@/components/ui/ErrorScreen";

/**
 * The Notes workspace is a records tool — a growing pile of the learner's own
 * screenshots and reasoning. A generic "something went wrong" invites the fear
 * that the pile is gone, so this says plainly that it is not: uploads and
 * threads live in Supabase and are unaffected by a render failure.
 */
export default function NotesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      title="Notes did not open"
      message="Your screenshots and threads are stored and safe — this is the workspace failing to draw, not your notes. Try again."
      error={error}
      reset={reset}
      homeHref="/home"
      homeLabel="Back to your activities"
    />
  );
}
