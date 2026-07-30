// "Let's Do This!" — the Python fundamentals series (replaces the old
// pandas-flavoured `data-essentials` warm-up).
//
// Unlike the analytics packs in packs.ts, these packs teach no dataset: each
// topic (Variables, Strings, Loops, Classes, Decorators, ... all the way
// through basic FastAPI request/response patterns) gets its own 2-3 cells,
// and every cell is a fully self-contained snippet — no shared `rows`/`df`.
// `dataset` and `setupCode` are correspondingly empty for most of these packs
// (DrillMock hides the "Setup:" box when there's nothing to show); the two
// API-flavoured packs (requests/responses, routing) DO use `setupCode` to
// define a tiny in-memory stand-in for a web framework (`App`, a decorator-
// based router) so the FastAPI-style decorator/path/param syntax is real,
// typed-from-memory Python that actually runs — without pulling fastapi
// itself (and its Rust-backed pydantic-core dependency) into the Pyodide
// sandbox. See PROJECT_LOG.md for the full design rationale.
//
// Every solution + hidden assert below is verified against real CPython
// before being committed (scratch verification script, not checked in).

import type { DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

// ── Part 1 · Values & Types ─────────────────────────────────────────────────
const VALUES_AND_TYPES: DrillContent = {
  cumulative: false,
  scenario: {
    title: "Let's Do This! — Values & Types",
    role: "Part 1 of the fundamentals series. No dataset here — every rep is a small, self-contained snippet, the same moves you'll type a thousand times.",
    goal: "Variables, strings, casting, booleans, None, and basic f-string formatting — the absolute atoms of Python. Each cell is independent; write it from memory.",
    outcome: "That's the vocabulary every later topic assumes you already have cold: name a value, read/slice a string, convert between types, reason in True/False, and know what None means.",
    setupCode: "",
  },
  cells: [
    { id: "assign", task: `Create x, y, and label — three variables: x as 5, y as 2.5, and label as the string "widget".`,
      why: "Naming a value is the single most-repeated move in programming — get the reflex automatic before anything else.",
      solution: `x = 5\ny = 2.5\nlabel = "widget"`,
      assertions: `assert x == 5 and y == 2.5 and label == "widget"`,
      narrative: `Three assignments, three types — an int, a float, a string. Python doesn't need a declared type; the value on the right decides it.`,
      steps: [{ do: "Name an int", code: `x = 5` }, { do: "Name a float", code: `y = 2.5` }, { do: "Name a string", code: `label = "widget"` }] },
    { id: "swap", task: "Create a and b, starting at 1 and 2, then swap their values in a single line (no temp variable).",
      why: "Tuple-assignment swap is a Python idiom — reaching for it instead of a temp variable is a small but real fluency marker.",
      solution: `a, b = 1, 2\na, b = b, a`,
      assertions: `assert a == 2 and b == 1`,
      narrative: `a, b = b, a builds the tuple (b, a) on the right FIRST, using the old values, then unpacks it into a and b — so both swap together, with nothing overwritten prematurely.`,
      steps: [{ do: "Start them", code: `a, b = 1, 2` }, { do: "Swap in one line", code: `a, b = b, a` }] },
    { id: "concat", task: `Create greeting — the strings "Hello, " and "World!" joined with +.`,
      why: "String concatenation with + is the most basic way two pieces of text become one.",
      solution: `greeting = "Hello, " + "World!"`,
      assertions: `assert greeting == "Hello, World!"`,
      narrative: `+ between two strings glues them end to end — no space is added automatically, so it has to already be in one of the pieces.`,
      steps: [{ do: "Join the two strings", code: `"Hello, " + "World!"` }] },
    { id: "slice", task: `Create first3 — the first 3 characters of the string "Analytics".`,
      why: "Slicing with [:n] is the everyday way to take the start of a string — the reflex behind truncation, previews, and prefixes.",
      solution: `word = "Analytics"\nfirst3 = word[:3]`,
      assertions: `assert first3 == "Ana"`,
      narrative: `word[:3] means "from the start, up to (not including) index 3" — three characters, positions 0, 1, 2.`,
      steps: [{ do: "Name the string", code: `word = "Analytics"` }, { do: "Slice its first 3 characters", code: `word[:3]` }] },
    { id: "clean", task: `Create clean — the string "  Data Eng  " with leading/trailing whitespace stripped and lowercased.`,
      why: "Chaining .strip().lower() is the standard first move on any messy, human-typed text.",
      solution: `clean = "  Data Eng  ".strip().lower()`,
      assertions: `assert clean == "data eng"`,
      narrative: `.strip() removes the surrounding whitespace first; .lower() then normalises the case — chained left to right, each method returns a new string for the next to act on.`,
      steps: [{ do: "Strip the whitespace", code: `"  Data Eng  ".strip()` }, { do: "Lowercase it", code: `.lower()` }] },
    { id: "to_int", task: `Create n — the string "42" converted to an integer.`,
      why: "int(...) is how text becomes a number you can actually do arithmetic on — user input and file contents always arrive as strings.",
      solution: `n = int("42")`,
      assertions: `assert n == 42 and isinstance(n, int)`,
      narrative: `int("42") parses the digit characters into an actual integer — before this, "42" + 1 would be a TypeError, not 43.`,
      steps: [{ do: "Cast the string to int", code: `int("42")` }] },
    { id: "to_str", task: "Create text — the number 7.5 converted to a string.",
      why: "str(...) is the reverse direction — turning a number into text, e.g. to build a message or write to a file.",
      solution: `text = str(7.5)`,
      assertions: `assert text == "7.5" and isinstance(text, str)`,
      narrative: `str(7.5) renders the float as text; the two look similar when printed, but only one supports arithmetic and only the other supports .upper() and friends.`,
      steps: [{ do: "Cast the float to str", code: `str(7.5)` }] },
    { id: "to_bool", task: "Create flag — the integer 0 converted to a bool.",
      why: "bool(...) reveals Python's truthiness rules — 0, empty strings/lists, and None are all falsy; nearly everything else is truthy.",
      solution: `flag = bool(0)`,
      assertions: `assert flag is False`,
      narrative: `bool(0) is False — 0 is one of Python's few "falsy" values (alongside "", [], {}, and None). bool(1) or bool("anything") would be True.`,
      steps: [{ do: "Cast 0 to bool", code: `bool(0)` }] },
    { id: "compare", task: "Create is_bigger — True if 7 is greater than 3, else False, using a comparison.",
      why: "A comparison operator (>, <, ==, ...) evaluates directly to a bool — no if statement needed to get True/False.",
      solution: `is_bigger = 7 > 3`,
      assertions: `assert is_bigger is True`,
      narrative: `7 > 3 is an expression, not a statement — it evaluates immediately to the bool True, which is_bigger then names.`,
      steps: [{ do: "Compare the two numbers", code: `7 > 3` }] },
    { id: "and_or", task: "Create can_vote — True only if age is at least 18 AND has_id is True (age=20, has_id=True).",
      why: "and combines two conditions into one — both must be True for the whole expression to be True.",
      solution: `age = 20\nhas_id = True\ncan_vote = age >= 18 and has_id`,
      assertions: `assert can_vote is True`,
      narrative: `age >= 18 and has_id evaluates the left side first; only if it's True does the right side even matter — both conditions must hold for can_vote to be True.`,
      steps: [{ do: "Set up the two facts", code: `age = 20; has_id = True` }, { do: "Require both", code: `age >= 18 and has_id` }] },
    { id: "default", task: "Create result, starting as None, to represent 'nothing computed yet'.",
      why: "None is Python's explicit placeholder for absence — the standard way to say 'no value here' before a real value exists.",
      solution: `result = None`,
      assertions: `assert result is None`,
      narrative: `None is a singleton — there's only ever one of it — which is why you check for it with is, not ==.`,
      steps: [{ do: "Name the placeholder", code: `result = None` }] },
    { id: "check", task: "Create status — \"missing\" if value is None else \"present\" (value is None).",
      why: "`is None` (not `== None`) is the idiomatic check — reading it back reinforces the right habit.",
      solution: `value = None\nstatus = "missing" if value is None else "present"`,
      assertions: `assert status == "missing"`,
      narrative: `The conditional expression reads left to right: the "missing" branch, then the test (value is None), then the else branch — one line instead of a 4-line if/else.`,
      steps: [{ do: "Start with nothing", code: `value = None` }, { do: "Branch on the identity check", code: `"missing" if value is None else "present"` }] },
    { id: "fstring", task: `Create msg — an f-string: "Score: {score}" with score = 88.`,
      why: "f-strings are the modern, readable way to build a string from variables — no + concatenation needed.",
      solution: `score = 88\nmsg = f"Score: {score}"`,
      assertions: `assert msg == "Score: 88"`,
      narrative: `The f prefix turns {score} inside the string into a live expression — Python evaluates it and splices the result straight in.`,
      steps: [{ do: "Name the value", code: `score = 88` }, { do: "Embed it in an f-string", code: `f"Score: {score}"` }] },
    { id: "fstring_format_spec", task: `Create pct — an f-string showing 0.4567 as a percentage with 1 decimal place, e.g. "45.7%".`,
      why: "A format spec after a colon inside {} controls exactly how a value is rendered — here, percent with fixed precision.",
      solution: `value = 0.4567\npct = f"{value:.1%}"`,
      assertions: `assert pct == "45.7%"`,
      narrative: `{value:.1%} multiplies value by 100, rounds to 1 decimal place, and appends a % — one format spec doing three jobs.`,
      steps: [{ do: "Name the fraction", code: `value = 0.4567` }, { do: "Format it as a percentage", code: `f"{value:.1%}"` }] },
    { id: "labeled", task: "Create label — an f-string \"x = 3\" built from a variable x = 3 (and write a short # comment above explaining what label is for — comments don't affect the result, but the habit matters).",
      why: "A comment explains WHY a line exists for the next reader (often future-you) — write one whenever the reason isn't obvious from the code itself.",
      solution: `# label is the human-readable form of x, used for display\nx = 3\nlabel = f"x = {x}"`,
      assertions: `assert label == "x = 3"`,
      narrative: `The # comment is invisible to Python at runtime — it's purely for the human reading the code next, so it's worth writing even though nothing checks for it here.`,
      steps: [{ do: "Note the why in a comment", code: `# label is the human-readable form of x` }, { do: "Build the f-string", code: `f"x = {x}"` }] },
  ],
};

// ── Part 2 · Collections ────────────────────────────────────────────────────
const COLLECTIONS: DrillContent = {
  cumulative: false,
  scenario: {
    title: "Let's Do This! — Collections",
    role: "Part 2 of the fundamentals series. Lists, tuples, and dictionaries — the three containers behind almost everything you'll build.",
    goal: "Each cell is one standard move on lists, tuples, or dicts. Independent reps; write each from memory.",
    outcome: "That's the container toolkit: build and grow a list, unpack and respect a tuple's immutability, read a dict with a safe default and merge two together.",
    setupCode: "",
  },
  cells: [
    { id: "build_list", task: "Create nums — a list containing 3, 1, 4, 1, 5, built by listing the values directly.",
      why: "A list literal — square brackets, comma-separated — is the most basic way to name an ordered, mutable collection.",
      solution: `nums = [3, 1, 4, 1, 5]`,
      assertions: `assert nums == [3, 1, 4, 1, 5]`,
      narrative: `[3, 1, 4, 1, 5] creates a list in one line, keeping the exact order (and duplicates) you wrote — unlike a set, nothing gets deduplicated or reordered.`,
      steps: [{ do: "List the values", code: `[3, 1, 4, 1, 5]` }] },
    { id: "append", task: `Create fruits — start with ["apple", "banana"], then append "cherry" to it.`,
      why: ".append() grows a list in place — the standard way to add one item at the end.",
      solution: `fruits = ["apple", "banana"]\nfruits.append("cherry")`,
      assertions: `assert fruits == ["apple", "banana", "cherry"]`,
      narrative: `.append() mutates fruits directly (it returns None, not a new list) — that's why the line is just fruits.append(...), not fruits = fruits.append(...).`,
      steps: [{ do: "Start the list", code: `fruits = ["apple", "banana"]` }, { do: "Add one item to the end", code: `fruits.append("cherry")` }] },
    { id: "comprehension", task: "Create squares — the squares of 1 through 5, using a list comprehension.",
      why: "A list comprehension is the idiomatic one-liner for 'build a new list by transforming each item' — the compressed form of a for-loop + append.",
      solution: `squares = [n * n for n in range(1, 6)]`,
      assertions: `assert squares == [1, 4, 9, 16, 25]`,
      narrative: `[n * n for n in range(1, 6)] reads as "n times n, for each n in range(1, 6)" — the expression comes first, the loop after, collected straight into a new list.`,
      steps: [{ do: "Loop over 1 through 5", code: `for n in range(1, 6)` }, { do: "Square each and collect", code: `[n * n for n in ...]` }] },
    { id: "build_tuple", task: "Create point — a tuple holding the coordinates (3, 4).",
      why: "Parentheses (or just a comma) build a tuple — an ordered, but FIXED, collection, unlike a list.",
      solution: `point = (3, 4)`,
      assertions: `assert point == (3, 4) and isinstance(point, tuple)`,
      narrative: `(3, 4) is a tuple, not a list — visually similar, but once built its contents can never be reassigned, which is the whole reason to reach for one.`,
      steps: [{ do: "Build the pair", code: `(3, 4)` }] },
    { id: "unpack_tuple", task: "Create x and y — unpack them from the tuple (3, 4).",
      why: "Unpacking a tuple straight into named variables is the everyday way multi-value returns get consumed.",
      solution: `point = (3, 4)\nx, y = point`,
      assertions: `assert x == 3 and y == 4`,
      narrative: `x, y = point matches position by position — x gets point's first element, y its second — the same mechanism a function returning multiple values relies on.`,
      steps: [{ do: "Have the tuple", code: `point = (3, 4)` }, { do: "Unpack it", code: `x, y = point` }] },
    { id: "immutable", task: "Create attempt_failed — True, after catching the TypeError from trying to modify a tuple's element.",
      why: "Tuples are immutable — proving it by catching the actual error is more convincing than just being told.",
      solution: `point = (3, 4)
attempt_failed = False
try:
    point[0] = 99
except TypeError:
    attempt_failed = True`,
      assertions: `assert attempt_failed is True`,
      narrative: `point[0] = 99 raises TypeError the instant it runs, because tuples don't support item assignment — the except clause catches exactly that and flips the flag, proving immutability rather than asserting it.`,
      steps: [{ do: "Try to mutate the tuple", code: `point[0] = 99` }, { do: "Catch the resulting error", code: `except TypeError: attempt_failed = True` }] },
    { id: "build_dict", task: `Create person — a dict with keys name="Ann" and age=30.`,
      why: "A dict literal — curly braces, key: value pairs — is how you name a lookup table from the start.",
      solution: `person = {"name": "Ann", "age": 30}`,
      assertions: `assert person == {"name": "Ann", "age": 30}`,
      narrative: `{"name": "Ann", "age": 30} maps each key straight to its value — no separate key list and value list to keep in sync.`,
      steps: [{ do: "Pair up keys and values", code: `{"name": "Ann", "age": 30}` }] },
    { id: "get_default", task: `Create role — person's "role" key, defaulting to "guest" if missing (person = {"name": "Ann"}).`,
      why: ".get(key, default) reads a dict without risking a KeyError — the safe habit over person[\"role\"].",
      solution: `person = {"name": "Ann"}\nrole = person.get("role", "guest")`,
      assertions: `assert role == "guest"`,
      narrative: `person["role"] would raise KeyError since "role" was never set; person.get("role", "guest") instead returns the fallback — no crash, no prior existence check needed.`,
      steps: [{ do: "The dict has no role key", code: `person = {"name": "Ann"}` }, { do: "Read it with a safe fallback", code: `person.get("role", "guest")` }] },
    { id: "update_dict", task: `Create merged — {"a": 1, "b": 2} updated with {"b": 20, "c": 3}.`,
      why: ".update() merges another mapping in — matching keys overwrite, new keys get added, both in one call.",
      solution: `merged = {"a": 1, "b": 2}\nmerged.update({"b": 20, "c": 3})`,
      assertions: `assert merged == {"a": 1, "b": 20, "c": 3}`,
      narrative: `.update({"b": 20, "c": 3}) overwrites the existing "b" (2 → 20) and adds the new "c" — "a" is untouched because the incoming dict never mentions it.`,
      steps: [{ do: "Start the dict", code: `merged = {"a": 1, "b": 2}` }, { do: "Merge another dict in", code: `merged.update({"b": 20, "c": 3})` }] },
  ],
};

// ── Part 3 · Control Flow ───────────────────────────────────────────────────
const CONTROL_FLOW: DrillContent = {
  cumulative: false,
  scenario: {
    title: "Let's Do This! — Control Flow",
    role: "Part 3 of the fundamentals series. If/elif/else branching, plus for and while loops — how a script decides and repeats.",
    goal: "Each cell is one standard control-flow shape. Independent reps; write each from memory. (The everyday FOR-LOOP idioms — accumulate, filter, enumerate, zip — get their own deep-dive pack; these two are the basic shape.)",
    outcome: "That's branching and repetition covered: if, if/else, a full if/elif/elif/else chain, a for loop over a list and over range(), and a while loop that counts down, accumulates, and breaks early.",
    setupCode: "",
  },
  cells: [
    { id: "if_basic", task: "Create msg — \"positive\" if n is greater than 0 (n = 5), using an if statement.",
      why: "An if statement runs its body only when the condition is True — the most basic branch.",
      solution: `n = 5
if n > 0:
    msg = "positive"`,
      assertions: `assert msg == "positive"`,
      narrative: `The indented block under if n > 0: only executes when that test is True — with n = 5, it always runs.`,
      steps: [{ do: "Test the condition", code: `if n > 0:` }, { do: "Run the body when true", code: `msg = "positive"` }] },
    { id: "if_nested", task: "Create category — \"large\" if n is over 100, checked with an if nested inside an outer positivity check (n = 150).",
      why: "Nesting one if inside another lets you check a more specific condition only once the broader one already holds.",
      solution: `n = 150
category = "unknown"
if n > 0:
    if n > 100:
        category = "large"`,
      assertions: `assert category == "large"`,
      narrative: `The outer if n > 0: gates entry; only inside it does the inner if n > 100: even get evaluated — two levels of indentation, two levels of condition.`,
      steps: [{ do: "Default before checking", code: `category = "unknown"` }, { do: "Gate on positive, then on large", code: `if n > 0:\n    if n > 100: ...` }] },
    { id: "elif_grade", task: "Create grade — \"A\" if score >= 90, \"B\" if score >= 80, else \"C\" (score = 85), using if/elif/else.",
      why: "elif chains multiple exclusive conditions — only the FIRST one that's True runs, and the rest are skipped entirely.",
      solution: `score = 85
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
else:
    grade = "C"`,
      assertions: `assert grade == "B"`,
      narrative: `Python checks score >= 90 first (False for 85), then score >= 80 (True) — the moment one branch matches, the rest of the chain, including else, is skipped.`,
      steps: [{ do: "Check the top tier first", code: `if score >= 90: ...` }, { do: "Fall through to the next", code: `elif score >= 80: ...` }, { do: "Catch everything else", code: `else: ...` }] },
    { id: "else_parity", task: "Create parity — \"even\" if n is divisible by 2, else \"odd\" (n = 7), using if/else.",
      why: "else is the catch-all — whatever doesn't satisfy the if, runs the else branch instead.",
      solution: `n = 7
if n % 2 == 0:
    parity = "even"
else:
    parity = "odd"`,
      assertions: `assert parity == "odd"`,
      narrative: `n % 2 == 0 tests for no remainder on division by 2; for 7 that's False, so control falls straight to else — exactly one of the two branches ever runs.`,
      steps: [{ do: "Test divisibility by 2", code: `if n % 2 == 0: ...` }, { do: "Otherwise", code: `else: parity = "odd"` }] },
    { id: "elif_chain", task: "Create tier — \"gold\" if points >= 100, \"silver\" if points >= 50, \"bronze\" if points >= 10, else \"none\" (points = 60), using a full if/elif/elif/else chain.",
      why: "A longer elif chain scales the same pattern to more than two outcomes — order matters, since checks run top to bottom.",
      solution: `points = 60
if points >= 100:
    tier = "gold"
elif points >= 50:
    tier = "silver"
elif points >= 10:
    tier = "bronze"
else:
    tier = "none"`,
      assertions: `assert tier == "silver"`,
      narrative: `60 fails the >= 100 test, passes the >= 50 test — so tier becomes "silver" and the remaining elif/else are never even evaluated.`,
      steps: [{ do: "Check thresholds top to bottom", code: `if ... >= 100: elif ... >= 50: elif ... >= 10:` }, { do: "Fall back if none matched", code: `else: tier = "none"` }] },
    { id: "for_iterate", task: "Create total — the sum of [10, 20, 30], built with a for loop (not sum()).",
      why: "A for loop over a list visits each element once, in order — the basic shape every accumulation builds on.",
      solution: `nums = [10, 20, 30]
total = 0
for n in nums:
    total += n`,
      assertions: `assert total == 60`,
      narrative: `for n in nums: binds n to each element in turn; total += n runs once per element, so total ends up holding the running sum.`,
      steps: [{ do: "Start the running total", code: `total = 0` }, { do: "Add each element", code: `for n in nums: total += n` }] },
    { id: "for_range", task: "Create doubled — [0, 2, 4, 6, 8], built with a for loop over range(5).",
      why: "range(n) generates 0..n-1 without building a real list first — the standard way to loop a fixed number of times.",
      solution: `doubled = []
for i in range(5):
    doubled.append(i * 2)`,
      assertions: `assert doubled == [0, 2, 4, 6, 8]`,
      narrative: `range(5) yields 0, 1, 2, 3, 4 one at a time; doubling each and appending builds the result list step by step.`,
      steps: [{ do: "Loop 5 times", code: `for i in range(5):` }, { do: "Double and collect", code: `doubled.append(i * 2)` }] },
    { id: "while_countdown", task: "Create steps — [3, 2, 1], built by counting down from 3 with a while loop.",
      why: "A while loop repeats as long as its condition holds — unlike a for loop, YOU control when it stops.",
      solution: `steps = []
n = 3
while n > 0:
    steps.append(n)
    n -= 1`,
      assertions: `assert steps == [3, 2, 1]`,
      narrative: `while n > 0: re-checks the condition before every pass; n -= 1 is what eventually makes it False — forget that line and the loop never ends.`,
      steps: [{ do: "Loop while positive", code: `while n > 0:` }, { do: "Record it, then count down", code: `steps.append(n); n -= 1` }] },
    { id: "while_condition", task: "Create total — keep adding 5 to total (starting at 0) while total is less than 20.",
      why: "The condition can depend on the very value the loop body is changing — the loop stops itself once the target is reached.",
      solution: `total = 0
while total < 20:
    total += 5`,
      assertions: `assert total == 20`,
      narrative: `Each pass adds 5 and re-tests total < 20; once total reaches 20 the condition goes False and the loop exits — no separate counter needed.`,
      steps: [{ do: "Loop while under the target", code: `while total < 20:` }, { do: "Step toward it", code: `total += 5` }] },
    { id: "while_break", task: "Create found — the first number in [4, 9, 15, 22, 7] greater than 10, found with a while loop and break.",
      why: "break exits a while loop immediately, the same way it does a for loop — useful once a while loop has found what it needs.",
      solution: `nums = [4, 9, 15, 22, 7]
i = 0
found = None
while i < len(nums):
    if nums[i] > 10:
        found = nums[i]
        break
    i += 1`,
      assertions: `assert found == 15`,
      narrative: `i walks the index manually; the moment nums[i] clears 10 (at 15), found is set and break stops the loop right there — 22 and 7 are never examined.`,
      steps: [{ do: "Walk the index while in range", code: `while i < len(nums):` }, { do: "Stop at the first match", code: `if nums[i] > 10: found = nums[i]; break` }] },
  ],
};

export const LETS_DO_THIS_PACKS: DrillPack[] = [
  {
    id: "lets-do-this-values-types",
    title: "Let's Do This! — Values & Types",
    blurb: "Variables, strings, casting, booleans, None. Part 1 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: VALUES_AND_TYPES,
  },
  {
    id: "lets-do-this-collections",
    title: "Let's Do This! — Collections",
    blurb: "Lists, tuples, dictionaries. Part 2 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: COLLECTIONS,
  },
  {
    id: "lets-do-this-control-flow",
    title: "Let's Do This! — Control Flow",
    blurb: "If/elif/else branching, for and while loops. Part 3 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: CONTROL_FLOW,
  },
];
