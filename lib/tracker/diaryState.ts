/**
 * What the learner is actually looking at where a milestone's diary should be.
 *
 * Three sections of the milestone panel branch on the same four-way question —
 * the diary list itself, and the two gates deciding whether the Review Quiz and
 * Mastery buttons are offered — and all three used to ask it as
 * `entries.length === 0`. That expression cannot tell "you have written
 * nothing" apart from "we could not load what you wrote", which is precisely
 * the distinction architecture rule 5 exists to protect: a failed read must
 * never render as empty data.
 *
 * It matters most at the gates. An empty diary correctly says "add an entry
 * before starting the quiz". A *failed* diary said the same thing — instructing
 * the learner to do something they had already done, and withholding the button
 * until they did it again.
 *
 * The sibling of `buildState.ts`: the same job one screen over, resolving a
 * stored condition into the vocabulary the UI needs, in a pure function, so the
 * answer is unit-tested rather than spelled out three times in a component
 * (CLAUDE.md rule 7).
 */

/**
 * The precedence is the point. A load in flight is a wait; a load that came
 * back refused is a failure; only after a load has actually succeeded does a
 * count of zero mean the diary is empty.
 */
export type DiaryState =
  | "loading" // in flight — say so, offer nothing yet
  | "failed"  // came back refused — say so, offer a retry
  | "empty"   // succeeded, and there is genuinely nothing here yet
  | "ready";  // there are entries to show

export interface DiaryInput {
  loading: boolean;
  failed:  boolean;
  /**
   * Entries in hand. The panel clears these when a card opens, so today a
   * failed load always arrives here as 0 — but `failed` is checked ahead of
   * `count` regardless, so a future caller that keeps its entries across a
   * refresh still gets an honest answer rather than a lucky one.
   */
  count: number;
}

export function diaryState({ loading, failed, count }: DiaryInput): DiaryState {
  if (loading) return "loading";
  if (failed)  return "failed";
  return count > 0 ? "ready" : "empty";
}

/**
 * Whether the Review Quiz / Mastery buttons may be offered.
 *
 * Only "ready" qualifies, and "failed" is the case worth naming: a quiz is
 * built from diary entries, so a gate must not open on a diary it could not
 * read — and must not tell the learner the diary is empty either. It says it
 * could not check, and offers a retry.
 */
export function canStartFromDiary(state: DiaryState): boolean {
  return state === "ready";
}
