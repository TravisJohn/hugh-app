/**
 * Post-response work that must not be lost.
 *
 * On Vercel the invocation can freeze the moment the response returns, so a
 * floating promise started during a request may simply never finish. Next's
 * `after()` holds the invocation open until the task completes — but it throws
 * (`E468`) the moment it is called outside a request scope, and accounting must
 * never fail a user request. So: schedule when we can, run inline when we
 * cannot, and never throw either way.
 *
 * The scheduler is injected rather than imported, which is what makes this
 * testable at all (CLAUDE.md rule 7): `lib/usage.ts` imports `server-only` and
 * cannot be loaded under Vitest, and `after()` cannot be called without a
 * request. Both problems stay on the other side of this boundary.
 */

/** Shape of Next's `after` — takes the task, returns nothing, may throw. */
export type Scheduler = (task: () => Promise<void>) => void;

/**
 * Where a failure happened. Reported rather than swallowed, because these are
 * two different problems: `schedule` means the deferral is not working and the
 * work is now on the request's critical path; `task` means the work itself
 * failed and the spend went unrecorded.
 */
export type DeferStage = "schedule" | "task";

/**
 * Hand `task` to `schedule`, falling back to running it inline.
 *
 * Resolves once the task is *scheduled*, not once it has finished — that is the
 * point of it. A caller needing the stronger guarantee should run the task
 * directly instead.
 */
export async function deferOrRun(
  schedule: Scheduler,
  task:     () => Promise<void>,
  onError:  (stage: DeferStage, err: unknown) => void,
): Promise<void> {
  // Guarded once, so a failing task is reported identically whether it ran
  // post-response or inline — and so a throw can never escape into the
  // caller's request on either path.
  const guarded = async (): Promise<void> => {
    try {
      await task();
    } catch (err) {
      onError("task", err);
    }
  };

  try {
    schedule(guarded);
    return;
  } catch (err) {
    // No request scope to defer into. Doing the work now costs the caller
    // latency, which is strictly better than dropping it.
    onError("schedule", err);
  }

  await guarded();
}
