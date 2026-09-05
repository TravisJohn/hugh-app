"use client";

import ErrorScreen from "@/components/ui/ErrorScreen";

/**
 * Monitor is the other records tool — hand-kept skills, job applications and
 * uploaded documents that exist nowhere else. Same reasoning as `/notes`: the
 * reassurance is the message, because this is material a learner typed in by
 * hand and cannot regenerate.
 */
export default function MonitorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      title="Monitor did not open"
      message="Everything you have tracked is stored and safe — this is the page failing to draw, not your records. Try again."
      error={error}
      reset={reset}
      homeHref="/home"
      homeLabel="Back to your activities"
    />
  );
}
