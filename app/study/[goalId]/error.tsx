"use client";

import ErrorScreen from "@/components/ui/ErrorScreen";

/**
 * Covers the goal's board, its Ask page and its track view.
 *
 * The wording matters here more than anywhere else: a track that failed to
 * *build* is a different thing entirely, with its own status
 * (`lib/tracker/buildState.ts`), its own copy and its own Rebuild button. This
 * boundary is the screen failing to render, so it says so — otherwise a
 * learner reads "something went wrong" and reaches for a rebuild that would
 * discard a perfectly good track.
 */
export default function StudyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      title="This page did not load"
      message="Your track and everything on it are safe — it is this screen that failed, not your learning. Try again, or go back and open it fresh."
      error={error}
      reset={reset}
      homeHref="/home/learn"
      homeLabel="Back to your tracks"
    />
  );
}
