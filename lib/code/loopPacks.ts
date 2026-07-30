// For-loop constructs — plain stdlib looping idioms (accumulator, filter with
// continue, break, enumerate, zip, dict-counting, nested loops, comprehension
// equivalents). No pandas: this is a foundational construct, independent of
// any data library. Every solution + hidden assert verified in real CPython.

import { pyRowsLiteral, type DataRow, type DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

const ORDER_ROWS: DataRow[] = [
  { order_id: 1, category: "B", amount: 15 },
  { order_id: 2, category: "C", amount: 8 },
  { order_id: 3, category: "A", amount: 12 },
  { order_id: 4, category: "A", amount: 22 },
  { order_id: 5, category: "B", amount: 19 },
  { order_id: 6, category: "B", amount: 31 },
  { order_id: 7, category: "C", amount: 27 },
  { order_id: 8, category: "A", amount: 40 },
];

const FOR_LOOP_CONSTRUCTS: DrillContent = {
  dataKind: "rows",
  cumulative: false,
  scenario: {
    title: "For-loop constructs — the everyday shapes",
    role: "Eight orders in `rows`. Before reaching for a library, these are the loop shapes that show up in almost every script: accumulate, filter, break early, track position, pair up, count, nest.",
    goal: "Each cell is one standard for-loop shape on the same `rows`. Independent reps; write each from memory — the point is the CONSTRUCT, not this particular data.",
    outcome: "That's the everyday for-loop toolkit: accumulate, filter with continue, stop with break, enumerate, zip, dict-counting, a nested loop, and its comprehension equivalent.",
    setupCode: pyRowsLiteral(ORDER_ROWS),
    dataset: ORDER_ROWS,
  },
  cells: [
    { id: "amounts", task: "Create amounts — a list of every row's amount, built with a for loop.", why: "Building a list by looping and appending is the most basic accumulator shape — everything else below is a variation on it.",
      focus: ["amount"], solution: `amounts = []
for r in rows:
    amounts.append(r["amount"])`,
      assertions: `assert amounts == [15, 8, 12, 22, 19, 31, 27, 40]`,
      narrative: `Start with an empty list, then append one value per iteration — the loop body runs once per row, growing the list by one each time.`,
      steps: [{ do: "Start empty", code: `amounts = []` }, { do: "Append each row's amount", code: `amounts.append(r["amount"])` }] },
    { id: "total", task: "Create total — the sum of every amount, built with a for loop (not sum()).", why: "The running-total accumulator — a variable initialised before the loop, updated on every pass — is the shape behind almost every manual aggregation.",
      focus: ["amount"], solution: `total = 0
for r in rows:
    total += r["amount"]`,
      assertions: `assert total == 174`,
      narrative: `total starts at 0 outside the loop, then += adds each row's amount to it in turn — the running total is whatever total holds once the loop finishes.`,
      steps: [{ do: "Start the running total at 0", code: `total = 0` }, { do: "Add each amount to it", code: `total += r["amount"]` }] },
    { id: "big", task: "Create big — the order_ids of every row with amount 20 or more, using continue to skip the rest.", why: "continue is how a loop skips the remainder of THIS iteration and moves straight to the next — a filter without an if/else.",
      focus: ["amount"], solution: `big = []
for r in rows:
    if r["amount"] < 20:
        continue
    big.append(r["order_id"])`,
      assertions: `assert big == [4, 6, 7, 8]`,
      narrative: `continue jumps straight back to the top of the loop, so the append() line never runs for a row that fails the test — the rows that DO reach append are exactly the ones that pass.`,
      steps: [{ do: "Skip rows below the threshold", code: `if r["amount"] < 20: continue` }, { do: "Keep the rest", code: `big.append(r["order_id"])` }] },
    { id: "first_over_30", task: "Create first_over_30 — the order_id of the FIRST row with amount over 30, using break to stop early.", why: "break exits the loop entirely the moment you've found what you need — no reason to keep scanning.",
      focus: ["amount"], solution: `first_over_30 = None
for r in rows:
    if r["amount"] > 30:
        first_over_30 = r["order_id"]
        break`,
      assertions: `assert first_over_30 == 6`,
      narrative: `The loop checks rows in order and, the instant one clears 30, records its order_id and break stops the loop immediately — later rows (like order 8's 40) are never even examined.`,
      steps: [{ do: "Default to not-found", code: `first_over_30 = None` }, { do: "Stop at the first match", code: `if r["amount"] > 30: ...; break` }] },
    { id: "tagged", task: `Create tagged — a list of "index:category" strings, one per row, using enumerate.`, why: "enumerate() hands you the position AND the item together — the standard way to loop when you need both.",
      focus: ["category"], solution: `tagged = []
for i, r in enumerate(rows):
    tagged.append(f"{i}:{r['category']}")`,
      assertions: `assert tagged == ["0:B", "1:C", "2:A", "3:A", "4:B", "5:B", "6:C", "7:A"]`,
      narrative: `enumerate(rows) yields (0, rows[0]), (1, rows[1]), … in turn; unpacking straight into i, r gives you the position without a separate counter variable to manage.`,
      steps: [{ do: "Loop with a position AND the row", code: `for i, r in enumerate(rows):` }, { do: "Combine both into one string", code: `f"{i}:{r['category']}"` }] },
    { id: "paired", task: "Create paired — a list of (order_id, amount) tuples, built by zipping the two columns together.", why: "zip() walks two (or more) sequences in lockstep — the standard way to combine parallel lists without indexing by hand.",
      focus: ["order_id", "amount"], solution: `ids = [r["order_id"] for r in rows]
amts = [r["amount"] for r in rows]
paired = list(zip(ids, amts))`,
      assertions: `assert paired == [(1, 15), (2, 8), (3, 12), (4, 22), (5, 19), (6, 31), (7, 27), (8, 40)]`,
      narrative: `zip(ids, amts) pairs up the two lists position by position into tuples; list(...) unrolls the zip object into an actual list you can index or print.`,
      steps: [{ do: "Pull out two parallel lists", code: `ids = [...]; amts = [...]` }, { do: "Zip them together", code: `list(zip(ids, amts))` }] },
    { id: "counts", task: "Create counts — a dict of how many orders fall in each category, built with a for loop.", why: "Building a frequency dict with .get(key, 0) as a fallback is the manual shape behind collections.Counter.",
      focus: ["category"], solution: `counts = {}
for r in rows:
    counts[r["category"]] = counts.get(r["category"], 0) + 1`,
      assertions: `assert counts == {"B": 3, "C": 2, "A": 3}`,
      narrative: `.get(key, 0) returns the running count for a category, or 0 the first time it's seen; adding 1 and storing it back is how a dict accumulates counts one row at a time.`,
      steps: [{ do: "Start with an empty dict", code: `counts = {}` }, { do: "Bump each category's count", code: `counts[r["category"]] = counts.get(r["category"], 0) + 1` }] },
    { id: "pairs", task: "Create pairs — how many PAIRS of orders share the same category, using a nested loop over index ranges.", why: "A nested for loop with range(i+1, ...) as the inner bound is how you compare every item to every OTHER item exactly once, with no repeats.",
      focus: ["category"], solution: `pairs = 0
for i in range(len(rows)):
    for j in range(i + 1, len(rows)):
        if rows[i]["category"] == rows[j]["category"]:
            pairs += 1`,
      assertions: `assert pairs == 7`,
      narrative: `The inner loop starts at i + 1, not 0, so each pair of rows is compared exactly once (never against itself, never twice) — the classic nested-index pattern for all-pairs comparisons.`,
      steps: [
        { do: "Loop over every row by index", code: `for i in range(len(rows)):` },
        { do: "Compare it to every LATER row", code: `for j in range(i + 1, len(rows)):` },
        { do: "Count matching pairs", code: `if rows[i]["category"] == rows[j]["category"]: pairs += 1` },
      ] },
    { id: "running_max", task: "Create running_max — the running maximum amount seen so far, one entry per row, tracked with a for loop.", why: "Carrying state across iterations (not just accumulating a total) is what makes a loop 'running' anything — max, min, or a moving average.",
      focus: ["amount"], solution: `running_max = []
current = float("-inf")
for r in rows:
    current = max(current, r["amount"])
    running_max.append(current)`,
      assertions: `assert running_max == [15, 15, 15, 22, 22, 31, 31, 40]`,
      narrative: `current starts at negative infinity so the very first amount always wins; each iteration takes the max of what's been seen so far and the new value, so current can only ever climb (or hold steady).`,
      steps: [{ do: "Start current as low as possible", code: `current = float("-inf")` }, { do: "Update it with each new amount", code: `current = max(current, r["amount"])` }] },
    { id: "flat", task: "Create flat — [[1, 2], [3], [4, 5, 6]] flattened into one list, using a nested for loop.", why: "A nested for loop — one to walk the outer groups, one to walk each group's items — is the manual way to flatten before reaching for a library helper.",
      focus: [], solution: `nested = [[1, 2], [3], [4, 5, 6]]
flat = []
for group in nested:
    for x in group:
        flat.append(x)`,
      assertions: `assert flat == [1, 2, 3, 4, 5, 6]`,
      narrative: `The outer loop visits each sub-list in turn; the inner loop then visits each item inside THAT sub-list — every item gets appended exactly once, in order.`,
      steps: [{ do: "Loop over each sub-list", code: `for group in nested:` }, { do: "Loop over each item inside it", code: `for x in group: flat.append(x)` }] },
    { id: "flat_comp", task: "Create flat_comp — the same flatten as the previous cell, but written as a single nested list comprehension.", why: "A nested comprehension reads left-to-right in the same order as the nested for loop it replaces — same logic, one line.",
      focus: [], solution: `nested = [[1, 2], [3], [4, 5, 6]]
flat_comp = [x for group in nested for x in group]`,
      assertions: `assert flat_comp == [1, 2, 3, 4, 5, 6]`,
      narrative: `Read it in loop order: "for group in nested, for x in group, collect x" — the comprehension's clause order matches the nested for loop's, just without the append() calls.`,
      steps: [{ do: "Same two loops, one line", code: `[x for group in nested for x in group]` }] },
  ],
};

export const LOOP_PACKS: DrillPack[] = [
  { id: "for-loop-constructs", title: "For-loop constructs", blurb: "Accumulate, filter, break, enumerate, zip, nest — the everyday loop shapes. 11 reps.", tag: "python", lang: "python", content: FOR_LOOP_CONSTRUCTS },
];
