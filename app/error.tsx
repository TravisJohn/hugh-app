"use client";

import ErrorScreen from "@/components/ui/ErrorScreen";

/**
 * The catch-all boundary for everything rendered inside the root layout.
 *
 * Before this existed, any render throw in production showed Next's raw error
 * page — no branding, no way back, and no distinction between "Hugh broke" and
 * "Hugh is thinking" (architecture rule 5). Segments whose exit differs
 * meaningfully — `/study/[goalId]`, `/notes`, `/monitor` — carry their own
 * boundary and are caught before reaching this one.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      title="Something went wrong"
      message="This screen failed to load. It is not something you did, and nothing you have saved is affected."
      error={error}
      reset={reset}
      homeHref="/home"
      homeLabel="Back to your activities"
    />
  );
}
