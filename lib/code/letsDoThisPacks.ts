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

// ── Part 4 · Functions ──────────────────────────────────────────────────────
const FUNCTIONS: DrillContent = {
  cumulative: false,
  scenario: {
    title: "Let's Do This! — Functions",
    role: "Part 4 of the fundamentals series. Defining functions, parameters (default, keyword, *args), the global keyword, and docstrings.",
    goal: "Each cell defines and calls a small function. Independent reps; write each from memory.",
    outcome: "That's functions covered end to end: define, return (single and multiple values), default/keyword/variadic parameters, read AND write a module-level variable with global, and document a function with a docstring.",
    setupCode: "",
  },
  cells: [
    { id: "fn_define", task: "Create result — call a function square(n) that returns n squared, with n = 6.",
      why: "def + return is the basic shape of a function — take input, hand back an output.",
      solution: `def square(n):
    return n * n

result = square(6)`,
      assertions: `assert result == 36`,
      narrative: `def square(n): names the function and its parameter; return n * n is what the CALL square(6) evaluates to — the function only runs when called, not when defined.`,
      steps: [{ do: "Define it", code: `def square(n): return n * n` }, { do: "Call it", code: `square(6)` }] },
    { id: "fn_multi_return", task: "Create lo and hi — call a function bounds(nums) that returns the min and max as a tuple, on [4, 1, 9, 2].",
      why: "Returning a tuple is how a Python function hands back more than one value — the caller just unpacks it.",
      solution: `def bounds(nums):
    return min(nums), max(nums)

lo, hi = bounds([4, 1, 9, 2])`,
      assertions: `assert lo == 1 and hi == 9`,
      narrative: `return min(nums), max(nums) packs both values into one tuple; lo, hi = bounds(...) unpacks it on the way out — the same unpacking you already used on a plain tuple.`,
      steps: [{ do: "Return two values as a tuple", code: `return min(nums), max(nums)` }, { do: "Unpack the call", code: `lo, hi = bounds([4, 1, 9, 2])` }] },
    { id: "fp_default", task: `Create msg — call greet(name) with a default greeting="Hello" parameter, called as greet("Ann").`,
      why: "A default parameter value makes an argument optional — callers can leave it out and get a sensible fallback.",
      solution: `def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

msg = greet("Ann")`,
      assertions: `assert msg == "Hello, Ann!"`,
      narrative: `greeting="Hello" in the signature only applies when the caller doesn't supply their own — greet("Ann") uses it, so greeting is "Hello" inside the function.`,
      steps: [{ do: "Give greeting a default", code: `def greet(name, greeting="Hello"):` }, { do: "Call without it", code: `greet("Ann")` }] },
    { id: "fp_keyword", task: `Create msg2 — call greet(name, greeting="Hello") using a keyword argument to override the default, name="Ben", greeting="Hi".`,
      why: "A keyword argument names which parameter it fills, overriding a default explicitly and self-documenting the call.",
      solution: `def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

msg2 = greet("Ben", greeting="Hi")`,
      assertions: `assert msg2 == "Hi, Ben!"`,
      narrative: `greeting="Hi" in the CALL (not the def) passes "Hi" specifically for that parameter by name, so it wins over the def's own default of "Hello".`,
      steps: [{ do: "Call with a named override", code: `greet("Ben", greeting="Hi")` }] },
    { id: "fp_args", task: "Create total — call add_all(1, 2, 3, 4) where add_all accepts any number of positional arguments with *args and sums them.",
      why: "*args collects any number of positional arguments into a tuple — the way a function accepts a variable-length argument list.",
      solution: `def add_all(*args):
    return sum(args)

total = add_all(1, 2, 3, 4)`,
      assertions: `assert total == 10`,
      narrative: `Inside add_all, args is the tuple (1, 2, 3, 4) — however many arguments the caller passes, *args gathers them all under one name.`,
      steps: [{ do: "Gather every positional arg", code: `def add_all(*args):` }, { do: "Sum the tuple", code: `sum(args)` }] },
    { id: "global_read", task: "Create result — a function reads (but doesn't modify) a module-level counter variable (counter = 5) and returns counter * 2.",
      why: "A function can READ a variable from the enclosing scope with no special syntax — global is only needed when you want to WRITE to it.",
      solution: `counter = 5

def double_counter():
    return counter * 2

result = double_counter()`,
      assertions: `assert result == 10`,
      narrative: `double_counter() has no counter parameter and no global declaration, yet it sees counter fine — Python looks outward to the enclosing scope automatically for reads.`,
      steps: [{ do: "Define it at module level", code: `counter = 5` }, { do: "Just read it inside a function", code: `def double_counter(): return counter * 2` }] },
    { id: "global_write", task: "Create counter — start at 0, then call a function increment() that uses the global keyword to modify counter by +1, called twice.",
      why: "global tells Python 'this name refers to the module-level variable, not a new local one' — required the moment a function assigns to an outer variable.",
      solution: `counter = 0

def increment():
    global counter
    counter += 1

increment()
increment()`,
      assertions: `assert counter == 2`,
      narrative: `Without global counter, counter += 1 inside the function would create a brand-new LOCAL counter and error (used before assignment) — the declaration is what makes it mutate the module-level one instead.`,
      steps: [{ do: "Declare intent to mutate the outer name", code: `global counter` }, { do: "Call it twice", code: `increment(); increment()` }] },
    { id: "doc_basic", task: `Create doc — the docstring of a function square(n) that returns n*n, written with a one-line docstring "Return n squared.", read via square.__doc__.`,
      why: "A docstring — a string literal right under def — becomes the function's documentation, retrievable at runtime via .__doc__.",
      solution: `def square(n):
    """Return n squared."""
    return n * n

doc = square.__doc__`,
      assertions: `assert doc == "Return n squared."`,
      narrative: `The triple-quoted string directly after the def line isn't executed like normal code — Python stores it on the function object itself, readable later as square.__doc__ (and by help(square)).`,
      steps: [{ do: "Write it as the first statement", code: `"""Return n squared."""` }, { do: "Read it back off the function", code: `square.__doc__` }] },
    { id: "doc_multiline", task: "Create summary — the first line of a multi-line docstring on a function describe(), read via describe.__doc__.splitlines()[0].",
      why: "Docstrings are ordinary multi-line strings — convention puts a one-line summary first, then a blank line, then more detail.",
      solution: `def describe():
    """One-line summary.

    Longer explanation goes here, if needed.
    """
    return None

summary = describe.__doc__.splitlines()[0]`,
      assertions: `assert summary == "One-line summary."`,
      narrative: `.__doc__ returns the whole triple-quoted block as one string; .splitlines()[0] takes just the first line — the short summary a reader (or an IDE tooltip) sees first.`,
      steps: [{ do: "Write summary, blank line, detail", code: `"""One-line summary.\\n\\n    Longer explanation...\\n    """` }, { do: "Read just the first line", code: `describe.__doc__.splitlines()[0]` }] },
  ],
};

// ── Part 5 · OOP ─────────────────────────────────────────────────────────────
const OOP: DrillContent = {
  cumulative: false,
  scenario: {
    title: "Let's Do This! — OOP",
    role: "Part 5 of the fundamentals series. Classes, inheritance, decorators, and generators — the constructs everything else in the series builds on.",
    goal: "Each cell is one standard OOP or functional-Python move. Independent reps; write each from memory.",
    outcome: "That's classes, inheritance (+ super() and isinstance), decorators (single and stacked), and generators (a manual next(), a break-driven collect, and a generator expression) — all covered.",
    setupCode: "",
  },
  cells: [
    { id: "class_define", task: "Create p — an instance of a class Point with x and y attributes, using __init__, created as Point(3, 4).",
      why: "__init__ is the constructor — it runs automatically when you call Point(...), setting up the instance's attributes.",
      solution: `class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

p = Point(3, 4)`,
      assertions: `assert p.x == 3 and p.y == 4`,
      narrative: `Point(3, 4) calls __init__(self, 3, 4) behind the scenes; self IS the new instance, so self.x = x attaches x as an attribute ON that instance — p.x reads it back.`,
      steps: [{ do: "Define the constructor", code: `def __init__(self, x, y): self.x = x; self.y = y` }, { do: "Instantiate it", code: `Point(3, 4)` }] },
    { id: "class_method", task: "Create area — call a method on a Rectangle class that computes width*height, for Rectangle(4, 5).",
      why: "A method is a function defined inside a class that takes self first — it operates on one particular instance's data.",
      solution: `class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

area = Rectangle(4, 5).area()`,
      assertions: `assert area == 20`,
      narrative: `Rectangle(4, 5).area() creates the instance, then calls area() on it — inside, self refers back to that same instance, so self.width and self.height are 4 and 5.`,
      steps: [{ do: "Define a method using self's attributes", code: `def area(self): return self.width * self.height` }, { do: "Build and call", code: `Rectangle(4, 5).area()` }] },
    { id: "class_attr", task: "Create count — track how many Widget instances have been created using a CLASS-level attribute, after creating 3 widgets.",
      why: "An attribute defined directly in the class body (not in __init__) is shared by every instance — the right home for a running total like this.",
      solution: `class Widget:
    total = 0

    def __init__(self):
        Widget.total += 1

Widget()
Widget()
Widget()
count = Widget.total`,
      assertions: `assert count == 3`,
      narrative: `total = 0 lives on the CLASS, not any one instance; Widget.total += 1 inside __init__ bumps that single shared value every time a new Widget is built, regardless of which instance triggered it.`,
      steps: [{ do: "Put the counter on the class", code: `class Widget: total = 0` }, { do: "Bump it on every construction", code: `Widget.total += 1` }] },
    { id: "inherit_basic", task: `Create sound — call speak() on a Dog, which inherits from Animal and overrides speak() to return "Woof".`,
      why: "class Dog(Animal) inherits everything Animal has; redefining a method in Dog overrides the parent's version for Dog instances.",
      solution: `class Animal:
    def speak(self):
        return "..."

class Dog(Animal):
    def speak(self):
        return "Woof"

sound = Dog().speak()`,
      assertions: `assert sound == "Woof"`,
      narrative: `Dog(Animal) means Dog IS an Animal, but its own speak() shadows Animal's — Python looks for speak on Dog first, finds one, and never falls back to the parent's.`,
      steps: [{ do: "Inherit from Animal", code: `class Dog(Animal):` }, { do: "Override its method", code: `def speak(self): return "Woof"` }] },
    { id: "inherit_super", task: `Create desc — a Cat.__init__ that calls Animal.__init__ via super() to set self.name, then adds its own self.sound = "Meow", for Cat("Tom"), building desc as f"{name}: {sound}".`,
      why: "super().__init__(...) reuses the PARENT's constructor instead of duplicating its logic — the standard way a subclass extends, rather than replaces, setup.",
      solution: `class Animal:
    def __init__(self, name):
        self.name = name

class Cat(Animal):
    def __init__(self, name):
        super().__init__(name)
        self.sound = "Meow"

c = Cat("Tom")
desc = f"{c.name}: {c.sound}"`,
      assertions: `assert desc == "Tom: Meow"`,
      narrative: `super().__init__(name) calls Animal's constructor, which sets self.name — Cat's own __init__ then adds sound on top, so the instance ends up with both attributes.`,
      steps: [{ do: "Reuse the parent's setup", code: `super().__init__(name)` }, { do: "Add the subclass's own attribute", code: `self.sound = "Meow"` }] },
    { id: "inherit_isinstance", task: "Create checks — a tuple of (isinstance(Dog(), Animal), isinstance(Animal(), Dog)) proving a Dog IS an Animal but not vice versa.",
      why: "isinstance() checks the relationship along the inheritance chain — a subclass instance passes for its parent, but not the other way round.",
      solution: `class Animal:
    pass

class Dog(Animal):
    pass

checks = (isinstance(Dog(), Animal), isinstance(Animal(), Dog))`,
      assertions: `assert checks == (True, False)`,
      narrative: `A Dog IS-A Animal by definition (class Dog(Animal)), so isinstance(Dog(), Animal) is True; the reverse isn't declared anywhere, so isinstance(Animal(), Dog) is False.`,
      steps: [{ do: "Check subclass against parent", code: `isinstance(Dog(), Animal)` }, { do: "Check parent against subclass", code: `isinstance(Animal(), Dog)` }] },
    { id: "deco_basic", task: `Create result — apply a decorator shout that uppercases a function's string return value, to a function greet() returning "hello".`,
      why: "A decorator is a function that takes a function and returns a replacement — @shout above def greet(): is shorthand for greet = shout(greet).",
      solution: `def shout(fn):
    def wrapper():
        return fn().upper()
    return wrapper

@shout
def greet():
    return "hello"

result = greet()`,
      assertions: `assert result == "HELLO"`,
      narrative: `shout(fn) returns wrapper, a new function that calls the original fn() and uppercases the result; @shout rebinds greet to that wrapper, so calling greet() now runs the wrapped version.`,
      steps: [{ do: "Build a replacement function", code: `def shout(fn):\n    def wrapper(): return fn().upper()\n    return wrapper` }, { do: "Apply it", code: `@shout\ndef greet(): return "hello"` }] },
    { id: "deco_args", task: "Create result — a decorator that doubles a function's numeric return value, applied to add(a, b) returning a+b, called as add(2, 3).",
      why: "*args, **kwargs in the wrapper let a decorator work on ANY function's signature, not just zero-argument ones.",
      solution: `def doubled(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs) * 2
    return wrapper

@doubled
def add(a, b):
    return a + b

result = add(2, 3)`,
      assertions: `assert result == 10`,
      narrative: `wrapper(*args, **kwargs) accepts whatever add would — here (2, 3) — forwards them straight to fn(*args, **kwargs), and doubles what comes back: (2+3)*2 = 10.`,
      steps: [{ do: "Forward any arguments through", code: `def wrapper(*args, **kwargs): return fn(*args, **kwargs) * 2` }, { do: "Apply and call", code: `@doubled\ndef add(a, b): ...\nadd(2, 3)` }] },
    { id: "deco_stacked", task: `Create result — stack two decorators (shout then exclaim) on greet() returning "hi", so the result is uppercased AND has "!" appended.`,
      why: "Stacked decorators apply bottom-up (closest to the function first) — reading the order right matters, since it changes the outcome.",
      solution: `def shout(fn):
    def wrapper():
        return fn().upper()
    return wrapper

def exclaim(fn):
    def wrapper():
        return fn() + "!"
    return wrapper

@shout
@exclaim
def greet():
    return "hi"

result = greet()`,
      assertions: `assert result == "HI!"`,
      narrative: `@exclaim (closest to def) wraps greet first, turning "hi" into "hi!"; @shout then wraps THAT result, uppercasing it to "HI!" — bottom decorator runs first, outer one wraps around it.`,
      steps: [{ do: "Nearest decorator applies first", code: `@exclaim  # "hi" -> "hi!"` }, { do: "Then the outer one wraps it", code: `@shout  # "hi!" -> "HI!"` }] },
    { id: "gen_basic", task: "Create result — the first 3 values produced by a generator function count_up() that yields 1, 2, 3, 4, 5..., collected with next().",
      why: "yield turns a function into a generator — it pauses at each yield and resumes right there on the next next() call, instead of running to completion.",
      solution: `def count_up():
    n = 1
    while True:
        yield n
        n += 1

gen = count_up()
result = [next(gen), next(gen), next(gen)]`,
      assertions: `assert result == [1, 2, 3]`,
      narrative: `Calling count_up() doesn't run the function yet — it returns a generator object. Each next(gen) resumes execution from the last yield, produces the next value, and pauses again — an infinite loop that never actually blocks anything.`,
      steps: [{ do: "Pause and produce with yield", code: `yield n` }, { do: "Pull values one at a time", code: `next(gen)` }] },
    { id: "gen_list", task: "Create evens — the first 4 even numbers from a generator function evens_from(start) that yields start, start+2, start+4, ..., collected into a list with a for loop and break (start=2).",
      why: "Looping a generator with for, then break-ing once you have enough, is how you take 'the first N' from something that never ends on its own.",
      solution: `def evens_from(start):
    n = start
    while True:
        yield n
        n += 2

evens = []
for v in evens_from(2):
    evens.append(v)
    if len(evens) == 4:
        break`,
      assertions: `assert evens == [2, 4, 6, 8]`,
      narrative: `for v in evens_from(2): pulls one value per iteration on demand; the moment evens has 4 items, break stops pulling — the generator never actually produces a 5th value.`,
      steps: [{ do: "Loop the generator", code: `for v in evens_from(2):` }, { do: "Stop once you have enough", code: `if len(evens) == 4: break` }] },
    { id: "gen_expr", task: "Create total — the sum of squares of 1 through 5, using a generator expression (parentheses, not brackets) passed straight to sum().",
      why: "A generator expression looks like a list comprehension but never builds the intermediate list — sum() consumes values one at a time, which is more memory-efficient.",
      solution: `total = sum(n * n for n in range(1, 6))`,
      assertions: `assert total == 55`,
      narrative: `n * n for n in range(1, 6) without square brackets is a generator expression — sum() pulls each squared value as it goes, never materialising [1, 4, 9, 16, 25] as an actual list in memory.`,
      steps: [{ do: "Build a generator expression", code: `n * n for n in range(1, 6)` }, { do: "Feed it straight to sum()", code: `sum( ... )` }] },
  ],
};

// ── Part 6 · Files, Envs & Logging ──────────────────────────────────────────
const FILES_ENVS_LOGGING: DrillContent = {
  cumulative: false,
  scenario: {
    title: "Let's Do This! — Files, Envs & Logging",
    role: "Part 6 of the fundamentals series. Reading/writing files, virtual environments, project layout, environment variables, and logging.",
    goal: "File handling and environment variables run for real here. Virtual environments and directory structure are shell/filesystem concepts with no Python result to compute — those cells drill the exact commands and layout from memory as data instead.",
    outcome: "That's the operational basics: read/write/append a file safely with `with`, know the venv create/activate/freeze commands cold, recall a standard project layout, read env vars with a safe default, and capture + format real log output.",
    setupCode: "",
  },
  cells: [
    { id: "file_write_read", task: `Create content — write "hello" to a file greeting.txt, then read it back.`,
      why: "`with open(...) as f:` is the standard, safe way to touch a file — it closes automatically even if something goes wrong inside the block.",
      solution: `with open("greeting.txt", "w") as f:
    f.write("hello")

with open("greeting.txt") as f:
    content = f.read()`,
      assertions: `assert content == "hello"`,
      narrative: `"w" mode opens for writing (creating or overwriting the file); the second with reopens it in the default read mode and .read() pulls the whole contents back as one string.`,
      steps: [{ do: "Write it", code: `with open("greeting.txt", "w") as f: f.write("hello")` }, { do: "Read it back", code: `with open("greeting.txt") as f: f.read()` }] },
    { id: "file_append", task: `Create lines — write two lines with "w", append a third with "a", then read all three back as a stripped list.`,
      why: "\"a\" mode adds to the end of an existing file instead of overwriting it — the mode for growing a log or record over time.",
      solution: `with open("log.txt", "w") as f:
    f.write("line1\\n")
    f.write("line2\\n")

with open("log.txt", "a") as f:
    f.write("line3\\n")

with open("log.txt") as f:
    lines = [line.strip() for line in f.readlines()]`,
      assertions: `assert lines == ["line1", "line2", "line3"]`,
      narrative: `readlines() returns each line INCLUDING its trailing newline; .strip() in the comprehension removes it so the final list holds clean strings, not "line1\\n".`,
      steps: [{ do: "Write two lines fresh", code: `open("log.txt", "w")` }, { do: "Append a third", code: `open("log.txt", "a")` }, { do: "Read and strip all three", code: `[line.strip() for line in f.readlines()]` }] },
    { id: "file_context_manager", task: "Create closed — True, proving the file handle auto-closes after a `with` block ends (check f.closed).",
      why: "The whole point of `with` is that it guarantees the file is closed on the way out of the block, even on an exception — worth confirming, not just trusting.",
      solution: `with open("temp.txt", "w") as f:
    f.write("x")

closed = f.closed`,
      assertions: `assert closed is True`,
      narrative: `f is still a valid name after the with block ends (Python doesn't delete it), but its .closed attribute flips to True the instant the block exits — that's the resource-cleanup guarantee 'with' gives you for free.`,
      steps: [{ do: "Use the file inside the block", code: `with open("temp.txt", "w") as f: ...` }, { do: "Check it after the block", code: `f.closed` }] },
    { id: "venv_commands", task: "Create commands — a list of the 3 terminal commands, in order, to create a virtual environment named venv, activate it (macOS/Linux), and install from requirements.txt.",
      why: "There's no Python result to compute for a venv — it's a filesystem/shell operation. Typing the exact commands from memory is what actually needs to be automatic.",
      solution: `commands = [
    "python -m venv venv",
    "source venv/bin/activate",
    "pip install -r requirements.txt",
]`,
      assertions: `assert commands == ["python -m venv venv", "source venv/bin/activate", "pip install -r requirements.txt"]`,
      narrative: `python -m venv venv creates an isolated interpreter + packages folder named venv; source .../activate switches your shell to use it; pip install -r requirements.txt then populates it from a pinned list — create, activate, install, in that order, every time.`,
      steps: [{ do: "Create the environment", code: `python -m venv venv` }, { do: "Activate it", code: `source venv/bin/activate` }, { do: "Install pinned dependencies", code: `pip install -r requirements.txt` }] },
    { id: "venv_freeze", task: "Create command — the single command that writes your environment's installed packages to requirements.txt.",
      why: "pip freeze is how you capture exactly what's installed, so a teammate (or CI) can reproduce the same environment.",
      solution: `command = "pip freeze > requirements.txt"`,
      assertions: `assert command == "pip freeze > requirements.txt"`,
      narrative: `pip freeze prints every installed package and its exact pinned version; the > redirects that output into requirements.txt instead of the terminal.`,
      steps: [{ do: "Capture installed packages", code: `pip freeze > requirements.txt` }] },
    { id: "dir_layout", task: `Create structure — a nested dict representing a standard FastAPI project layout: an "app" folder containing "main.py", a "routers" folder, and a "models" folder (folders as nested dicts, files as None).`,
      why: "Like venvs, a project's directory layout isn't something Python computes — recalling the conventional shape (app/main.py, app/routers/, app/models/) as data is the drill.",
      solution: `structure = {
    "app": {
        "main.py": None,
        "routers": {},
        "models": {},
    }
}`,
      assertions: `assert structure == {"app": {"main.py": None, "routers": {}, "models": {}}}`,
      narrative: `None marks a leaf (a file); an empty dict marks a folder that would hold its own files — the same shape you'd see running \`tree\` on a real FastAPI project.`,
      steps: [{ do: "The app package", code: `"app": { ... }` }, { do: "Its entrypoint and sub-packages", code: `"main.py": None, "routers": {}, "models": {}` }] },
    { id: "dir_entrypoint", task: "Create entrypoint — the conventional dotted-module path used to run a FastAPI app defined as `app` inside app/main.py, in the form used by uvicorn (module:variable).",
      why: "uvicorn's `module:variable` syntax is how it finds your app object — knowing the exact string for a standard layout saves a lookup every time you run the server.",
      solution: `entrypoint = "app.main:app"`,
      assertions: `assert entrypoint == "app.main:app"`,
      narrative: `app.main:app reads as "the app module inside the app package" (app/main.py), colon "the variable named app inside it" — exactly what \`uvicorn app.main:app\` needs to boot the server.`,
      steps: [{ do: "Dotted path to the module", code: `app.main` }, { do: "Colon, then the variable inside it", code: `:app` }] },
    { id: "env_read", task: `Create db_host — read the DATABASE_HOST environment variable, defaulting to "localhost" if unset (it's unset here).`,
      why: "os.environ.get(key, default) reads config from the environment without crashing when it's missing — the standard way to make a setting overridable but optional.",
      solution: `import os
db_host = os.environ.get("DATABASE_HOST", "localhost")`,
      assertions: `assert db_host == "localhost"`,
      narrative: `os.environ acts like a dict of the process's environment variables; .get(..., "localhost") returns the fallback instead of raising, since DATABASE_HOST was never set here.`,
      steps: [{ do: "Read the environment", code: `os.environ` }, { do: "With a safe fallback", code: `.get("DATABASE_HOST", "localhost")` }] },
    { id: "env_set_read", task: `Create api_key — set the API_KEY environment variable to "secret123", then read it back with os.getenv.`,
      why: "os.environ[key] = value sets a variable for THIS process (and anything it spawns); os.getenv is the read-side equivalent of .get().",
      solution: `import os
os.environ["API_KEY"] = "secret123"
api_key = os.getenv("API_KEY")`,
      assertions: `assert api_key == "secret123"`,
      narrative: `Setting os.environ["API_KEY"] mutates the process's environment directly; os.getenv("API_KEY") (a convenience wrapper around os.environ.get) reads it straight back.`,
      steps: [{ do: "Set it", code: `os.environ["API_KEY"] = "secret123"` }, { do: "Read it back", code: `os.getenv("API_KEY")` }] },
    { id: "log_basic", task: `Create messages — capture a single INFO log message "Started" from the logging module into a list (via a small custom handler, since logging normally writes to stderr, not a variable).`,
      why: "logging (not print) is how real applications record what happened — a Handler is where log records actually go once emitted.",
      solution: `import logging

messages = []

class ListHandler(logging.Handler):
    def emit(self, record):
        messages.append(record.getMessage())

logger = logging.getLogger("demo1")
logger.handlers.clear()
logger.setLevel(logging.INFO)
logger.addHandler(ListHandler())
logger.info("Started")`,
      assertions: `assert messages == ["Started"]`,
      narrative: `logger.info("Started") creates a LogRecord and hands it to every attached handler; our ListHandler's emit() is called with that record, and record.getMessage() gives back the formatted text. handlers.clear() first avoids piling up duplicate handlers if this cell runs more than once — the same fix real notebooks need.`,
      steps: [{ do: "Route records into a list", code: `class ListHandler(logging.Handler):\n    def emit(self, record): messages.append(record.getMessage())` }, { do: "Attach it and log", code: `logger.addHandler(ListHandler())\nlogger.info("Started")` }] },
    { id: "log_levels", task: `Create captured — only the WARNING message survives when the logger's level is set to WARNING (an INFO and a WARNING message are both logged).`,
      why: "A logger's level is a THRESHOLD — anything below it is silently dropped before it even reaches a handler, which is how you dial verbosity up or down.",
      solution: `import logging

captured = []

class ListHandler(logging.Handler):
    def emit(self, record):
        captured.append(record.getMessage())

logger = logging.getLogger("demo2")
logger.handlers.clear()
logger.setLevel(logging.WARNING)
logger.addHandler(ListHandler())
logger.info("just fyi")
logger.warning("heads up")`,
      assertions: `assert captured == ["heads up"]`,
      narrative: `setLevel(logging.WARNING) means only WARNING and above get processed — logger.info("just fyi") is discarded immediately (INFO < WARNING), so only "heads up" ever reaches the handler.`,
      steps: [{ do: "Raise the threshold", code: `logger.setLevel(logging.WARNING)` }, { do: "Below-threshold calls are dropped", code: `logger.info("just fyi")  # ignored` }] },
    { id: "log_levelname", task: `Create labeled — the level name ("ERROR") captured alongside the message, using record.levelname.`,
      why: "A LogRecord carries structured metadata (level, logger name, timestamp, ...) beyond just the message text — levelname is the human-readable severity.",
      solution: `import logging

labeled = []

class ListHandler(logging.Handler):
    def emit(self, record):
        labeled.append(f"{record.levelname}: {record.getMessage()}")

logger = logging.getLogger("demo3")
logger.handlers.clear()
logger.setLevel(logging.ERROR)
logger.addHandler(ListHandler())
logger.error("something broke")`,
      assertions: `assert labeled == ["ERROR: something broke"]`,
      narrative: `record.levelname is the string "ERROR" (not the numeric level); combining it with record.getMessage() in an f-string is a miniature version of what a real log formatter does automatically.`,
      steps: [{ do: "Read the severity off the record", code: `record.levelname` }, { do: "Combine with the message", code: `f"{record.levelname}: {record.getMessage()}"` }] },
    { id: "logfmt_basic", task: `Create output — a single captured log line formatted as "LEVEL: message" using a logging.Formatter with the format string "%(levelname)s: %(message)s", for logger.warning("disk low").`,
      why: "A Formatter turns a LogRecord into the final text — the %(field)s placeholders read straight off the record's attributes, so you never hand-build the string yourself.",
      solution: `import logging

output = []

class ListHandler(logging.Handler):
    def emit(self, record):
        output.append(self.format(record))

handler = ListHandler()
handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))

logger = logging.getLogger("fmt1")
logger.handlers.clear()
logger.setLevel(logging.WARNING)
logger.addHandler(handler)
logger.warning("disk low")`,
      assertions: `assert output == ["WARNING: disk low"]`,
      narrative: `self.format(record) inside emit() applies the handler's Formatter — "%(levelname)s: %(message)s" — producing exactly "WARNING: disk low", the same mechanism behind every real log line you've ever read.`,
      steps: [{ do: "Define the format string", code: `logging.Formatter("%(levelname)s: %(message)s")` }, { do: "Apply it in emit()", code: `self.format(record)` }] },
    { id: "logfmt_custom_field", task: `Create output — a captured log line including the logger's name via %(name)s, formatted as "[name] message", for a logger named "billing" logging.info("invoice sent").`,
      why: "%(name)s is the logger's own name — including it in the format is how a multi-module app tells log lines apart by WHERE they came from.",
      solution: `import logging

output = []

class ListHandler(logging.Handler):
    def emit(self, record):
        output.append(self.format(record))

handler = ListHandler()
handler.setFormatter(logging.Formatter("[%(name)s] %(message)s"))

logger = logging.getLogger("billing")
logger.handlers.clear()
logger.setLevel(logging.INFO)
logger.addHandler(handler)
logger.info("invoice sent")`,
      assertions: `assert output == ["[billing] invoice sent"]`,
      narrative: `getLogger("billing") names the logger itself; %(name)s in the format string pulls that name back out at format time, so every line from this logger is tagged [billing] automatically.`,
      steps: [{ do: "Name the logger", code: `logging.getLogger("billing")` }, { do: "Include its name in the format", code: `"[%(name)s] %(message)s"` }] },
  ],
};

// ── Part 7 · Exceptions, Typing & Status Codes ──────────────────────────────
const EXCEPTIONS_TYPING_STATUS: DrillContent = {
  cumulative: false,
  scenario: {
    title: "Let's Do This! — Exceptions, Typing & Status Codes",
    role: "Part 7 of the fundamentals series. try/except/finally, custom exceptions, type hints, and HTTP status codes — the last stretch of pure-Python groundwork before the API-flavoured packs.",
    goal: "Each cell is one standard move. Independent reps; write each from memory.",
    outcome: "That's error handling (catch, custom exception classes, finally's guarantee), type hints (basic, Optional, generics like List), and the HTTP status codes you'll return constantly, all covered.",
    setupCode: "",
  },
  cells: [
    { id: "ex_try_except", task: "Create result — \"caught\" after catching a ZeroDivisionError from 1/0 in a try/except.",
      why: "try/except is how Python code survives an expected failure instead of crashing the whole program.",
      solution: `try:
    1 / 0
    result = "no error"
except ZeroDivisionError:
    result = "caught"`,
      assertions: `assert result == "caught"`,
      narrative: `1 / 0 raises ZeroDivisionError immediately, so the line after it (result = "no error") never runs — control jumps straight to the matching except block instead.`,
      steps: [{ do: "Something that can fail", code: `1 / 0` }, { do: "Catch that specific error", code: `except ZeroDivisionError: result = "caught"` }] },
    { id: "ex_custom", task: `Create message — the string from a custom InsufficientFundsError raised with message "not enough balance", caught and its str() read back.`,
      why: "Subclassing Exception lets you define your own, meaningfully-named error type instead of overloading a generic one.",
      solution: `class InsufficientFundsError(Exception):
    pass

try:
    raise InsufficientFundsError("not enough balance")
except InsufficientFundsError as e:
    message = str(e)`,
      assertions: `assert message == "not enough balance"`,
      narrative: `class InsufficientFundsError(Exception): inherits all of Exception's behaviour for free — raising it with a message and catching it with as e works identically to any built-in exception, just with a name that says what actually went wrong.`,
      steps: [{ do: "Define a named error type", code: `class InsufficientFundsError(Exception): pass` }, { do: "Raise it with a message, then read it back", code: `raise InsufficientFundsError("not enough balance")\n... str(e)` }] },
    { id: "ex_finally", task: `Create order — a list recording that "try", then "except", then "finally" ran, when the try block raises a ValueError.`,
      why: "finally always runs — whether the try block succeeded, failed, or even returned early — the place for cleanup that must never be skipped.",
      solution: `order = []
try:
    order.append("try")
    raise ValueError("bad")
except ValueError:
    order.append("except")
finally:
    order.append("finally")`,
      assertions: `assert order == ["try", "except", "finally"]`,
      narrative: `The raise sends control to except (recording "except"), and only after that block finishes does finally run (recording "finally") — it executes on the way out no matter which path got there.`,
      steps: [{ do: "Something raises", code: `raise ValueError("bad")` }, { do: "Handle it", code: `except ValueError: order.append("except")` }, { do: "Always runs last", code: `finally: order.append("finally")` }] },
    { id: "ty_basic_hints", task: "Create result — call a type-hinted function add(a: int, b: int) -> int, with add(2, 3).",
      why: "Type hints (: int, -> int) document the expected types for readers and tools (mypy, IDEs) — Python itself doesn't enforce them at runtime.",
      solution: `def add(a: int, b: int) -> int:
    return a + b

result = add(2, 3)`,
      assertions: `assert result == 5`,
      narrative: `a: int and -> int are annotations, not runtime checks — add("x", "y") would still run and concatenate strings; the hints exist for humans and static analysis, not for Python's interpreter.`,
      steps: [{ do: "Annotate the parameters and return type", code: `def add(a: int, b: int) -> int:` }, { do: "Call it normally", code: `add(2, 3)` }] },
    { id: "ty_optional", task: `Create greeting — call a function greet(name: Optional[str] = None) -> str that returns "Hello, stranger" when name is None, else "Hello, {name}", called with no argument.`,
      why: "Optional[str] documents that a parameter can be str OR None — the standard way to hint 'this might be absent'.",
      solution: `from typing import Optional

def greet(name: Optional[str] = None) -> str:
    if name is None:
        return "Hello, stranger"
    return f"Hello, {name}"

greeting = greet()`,
      assertions: `assert greeting == "Hello, stranger"`,
      narrative: `Optional[str] is shorthand for Union[str, None] — it tells a reader (and a type checker) that name might legitimately be None, matching the default value and the if name is None: branch that handles it.`,
      steps: [{ do: "Hint 'str or None'", code: `name: Optional[str] = None` }, { do: "Handle the None case", code: `if name is None: return "Hello, stranger"` }] },
    { id: "ty_list_hints", task: "Create total — call a function total_of(prices: List[float]) -> float, annotated with List, on [1.5, 2.5, 3.0].",
      why: "List[float] hints not just 'a list', but a list OF a specific element type — more precise documentation than list alone.",
      solution: `from typing import List

def total_of(prices: List[float]) -> float:
    return sum(prices)

total = total_of([1.5, 2.5, 3.0])`,
      assertions: `assert total == 7.0`,
      narrative: `List[float] reads as "a list whose elements are floats" — the generic in brackets is what list by itself can't express, useful for anyone reading the signature without digging into the body.`,
      steps: [{ do: "Hint a list of floats", code: `prices: List[float]` }, { do: "Call it", code: `total_of([1.5, 2.5, 3.0])` }] },
    { id: "hs_common_codes", task: "Create codes — a dict mapping the 4 most common HTTP status codes to their meaning: 200 OK, 201 Created, 404 Not Found, 500 Internal Server Error.",
      why: "These four codes cover the large majority of everyday API responses — knowing them cold (not looking them up) is worth the rep.",
      solution: `codes = {
    200: "OK",
    201: "Created",
    404: "Not Found",
    500: "Internal Server Error",
}`,
      assertions: `assert codes == {200: "OK", 201: "Created", 404: "Not Found", 500: "Internal Server Error"}`,
      narrative: `200 means the request succeeded and here's the data; 201 means something new was successfully created; 404 means the thing you asked for doesn't exist; 500 means the server itself broke, not your request.`,
      steps: [{ do: "Success codes", code: `200: "OK", 201: "Created"` }, { do: "Error codes", code: `404: "Not Found", 500: "Internal Server Error"` }] },
    { id: "hs_classify", task: `Create category — classify status code 404 into its class name ("Client Error") using integer division on the status code (4xx = Client Error, 5xx = Server Error, 2xx = Success).`,
      why: "The first digit of an HTTP status code IS its category — status // 100 reads that digit directly, no string parsing needed.",
      solution: `def classify(status):
    if status // 100 == 2:
        return "Success"
    if status // 100 == 4:
        return "Client Error"
    if status // 100 == 5:
        return "Server Error"
    return "Other"

category = classify(404)`,
      assertions: `assert category == "Client Error"`,
      narrative: `404 // 100 is 4 — integer division drops the last two digits, leaving just the leading class digit, which classify() then maps to a name.`,
      steps: [{ do: "Extract the leading digit", code: `status // 100` }, { do: "Map it to a category", code: `if ... == 4: return "Client Error"` }] },
    { id: "hs_created", task: "Create status — 201, the correct status code to return after successfully CREATING a new resource via POST (not 200).",
      why: "200 vs 201 is a common mix-up — 201 specifically signals 'a new resource now exists', which matters to API clients that check for it.",
      solution: `status = 201`,
      assertions: `assert status == 201`,
      narrative: `200 just means "OK, here's a response"; 201 more precisely means "OK, AND I created something new" — a POST that creates a record should return 201, not the more generic 200.`,
      steps: [{ do: "The created-resource code", code: `201` }] },
  ],
};

// A tiny, fully self-contained stand-in for a web framework — real, typed-
// from-memory decorator syntax (@app.get("/path")) that registers a plain
// Python function in a dict, with no fastapi/starlette/pydantic-core import.
// Shared setupCode for the two API-flavoured packs below, so `app` is given
// once per cell (fresh every run) rather than redefined inside every solution.
const MINI_API_SETUP = `class App:
    def __init__(self):
        self.routes = {}

    def route(self, method, path):
        def decorator(fn):
            self.routes[(method, path)] = fn
            return fn
        return decorator

    def get(self, path):
        return self.route("GET", path)

    def post(self, path):
        return self.route("POST", path)

    def put(self, path):
        return self.route("PUT", path)

    def delete(self, path):
        return self.route("DELETE", path)


app = App()`;

// ── Part 8 · API Requests & Responses ───────────────────────────────────────
const API_REQUESTS_RESPONSES: DrillContent = {
  cumulative: false,
  scenario: {
    title: "Let's Do This! — API Requests & Responses",
    role: "Part 8 of the fundamentals series. FastAPI-style patterns — decorators, path/query params, request bodies, response shaping — without a live server.",
    goal: "You're given `app`, a tiny stand-in for FastAPI (same @app.get(\"/path\") decorator syntax) — real, typed-from-memory Python, just without an actual HTTP transport underneath. Register a route, then call it directly like FastAPI would, and check what comes back.",
    outcome: "That's request/response shaping covered: JSON vs. text, response models (and why they filter fields), field metadata, path params, request bodies, query params with defaults, and PUT/DELETE.",
    setupCode: MINI_API_SETUP,
  },
  cells: [
    { id: "json_dict_route", task: `Register a route GET /health on app that returns {"status": "ok"}, then call it directly and store the result.`,
      why: "Returning a plain dict is how a FastAPI handler produces a JSON response — no manual serialization call in the handler itself.",
      solution: `@app.get("/health")
def health():
    return {"status": "ok"}

result = app.routes[("GET", "/health")]()`,
      assertions: `assert result == {"status": "ok"}`,
      narrative: `@app.get("/health") registers health under ("GET", "/health") in app.routes; calling that entry directly is standing in for "the framework receives a GET /health request and invokes your handler".`,
      steps: [{ do: "Register the route", code: `@app.get("/health")\ndef health(): return {"status": "ok"}` }, { do: "Invoke it like the framework would", code: `app.routes[("GET", "/health")]()` }] },
    { id: "json_text_response", task: `Register a route GET /ping that returns the plain string "pong" (a text response, not JSON) — call it and store the result.`,
      why: "A handler can return plain text instead of a dict — FastAPI sends whatever you return, JSON isn't mandatory.",
      solution: `@app.get("/ping")
def ping():
    return "pong"

result = app.routes[("GET", "/ping")]()`,
      assertions: `assert result == "pong"`,
      narrative: `Nothing about the decorator changes — @app.get works the same whether the handler returns a dict, a string, or a model instance; it's the return TYPE that decides how the body gets shaped.`,
      steps: [{ do: "Return plain text", code: `def ping(): return "pong"` }] },
    { id: "json_serialize", task: `Create body — the JSON text FastAPI would actually send over the wire for {"status": "ok"}, using json.dumps.`,
      why: "Behind the scenes, a returned dict IS run through something like json.dumps — worth seeing what that step actually produces.",
      solution: `import json
body = json.dumps({"status": "ok"})`,
      assertions: `assert body == '{"status": "ok"}'`,
      narrative: `json.dumps(...) converts a Python dict into its JSON text form — this is the literal string a client would receive as the HTTP response body.`,
      steps: [{ do: "Serialize the dict to JSON text", code: `json.dumps({"status": "ok"})` }] },
    { id: "rm_define", task: "Register GET /users/1 whose handler returns a UserOut dataclass instance (id=1, name=\"Ann\") — a 'response model' shape — call it and store the result.",
      why: "A response model is a defined shape for what a route returns — here a plain @dataclass stands in for a Pydantic model, keeping the pattern real without the dependency.",
      solution: `from dataclasses import dataclass

@dataclass
class UserOut:
    id: int
    name: str

@app.get("/users/1")
def get_user():
    return UserOut(id=1, name="Ann")

result = app.routes[("GET", "/users/1")]()`,
      assertions: `assert result.id == 1 and result.name == "Ann"`,
      narrative: `@dataclass generates __init__ (and equality) for UserOut automatically from its two annotated fields — the handler returns a real UserOut instance, not a bare dict, giving the response a defined shape.`,
      steps: [{ do: "Define the response shape", code: `@dataclass\nclass UserOut: id: int; name: str` }, { do: "Return an instance of it", code: `return UserOut(id=1, name="Ann")` }] },
    { id: "rm_to_dict", task: "Create body — a UserOut(id=1, name=\"Ann\") response-model instance converted to a plain dict, using dataclasses.asdict, ready for JSON serialization.",
      why: "Before a response model instance can become JSON, it needs converting to a plain dict first — asdict() is the standard bridge.",
      solution: `from dataclasses import dataclass, asdict

@dataclass
class UserOut:
    id: int
    name: str

user = UserOut(id=1, name="Ann")
body = asdict(user)`,
      assertions: `assert body == {"id": 1, "name": "Ann"}`,
      narrative: `asdict(user) walks the dataclass's fields and builds an ordinary dict from them — the same dict json.dumps() would then be able to serialize.`,
      steps: [{ do: "Have the model instance", code: `UserOut(id=1, name="Ann")` }, { do: "Convert it to a plain dict", code: `asdict(user)` }] },
    { id: "rm_filter_fields", task: "Create output — given a full internal user dict with a password field, build the safe UserOut instance that DROPS password — the real reason response models exist.",
      why: "A response model isn't just documentation — it's how you guarantee a sensitive internal field (like a password hash) never accidentally reaches the client.",
      solution: `from dataclasses import dataclass

@dataclass
class UserOut:
    id: int
    name: str

internal = {"id": 1, "name": "Ann", "password": "hunter2"}
output = UserOut(id=internal["id"], name=internal["name"])`,
      assertions: `assert output.id == 1 and output.name == "Ann" and not hasattr(output, "password")`,
      narrative: `UserOut only declares id and name, so constructing it from internal necessarily leaves password behind — output simply has nowhere to put it, which is the whole safety guarantee a response model gives you.`,
      steps: [{ do: "The internal record has extra, sensitive fields", code: `internal = {"id": 1, "name": "Ann", "password": "hunter2"}` }, { do: "The output model only takes what it declares", code: `UserOut(id=internal["id"], name=internal["name"])` }] },
    { id: "efi_field_meta", task: `Create meta — call a hand-rolled field(default, description, **constraints) helper to build metadata for a 'name' field: default="", description="The user's display name", min_length=1.`,
      why: "Real Pydantic Field(...) attaches extra metadata (description, min_length, gt, ...) to a model field, used for both validation and OpenAPI docs — this helper captures the same idea as plain data.",
      solution: `def field(default=None, description=None, **constraints):
    return {"default": default, "description": description, **constraints}

meta = field(default="", description="The user's display name", min_length=1)`,
      assertions: `assert meta == {"default": "", "description": "The user's display name", "min_length": 1}`,
      narrative: `**constraints scoops up any extra keyword (min_length=1 here) into a dict, merged alongside default and description — the same "everything about this field in one place" idea Field(...) gives you in real Pydantic.`,
      steps: [{ do: "Capture named constraints generically", code: `def field(default=None, description=None, **constraints):` }, { do: "Attach one to a field", code: `field(default="", description="...", min_length=1)` }] },
    { id: "efi_validate", task: `Create errors — a list of validation errors when checking the value "" against meta's min_length constraint (value length below min_length).`,
      why: "Field metadata isn't just documentation — it's what a validator actually checks a value against before accepting it.",
      solution: `def field(default=None, description=None, **constraints):
    return {"default": default, "description": description, **constraints}

meta = field(default="", description="Name", min_length=1)
value = ""
errors = []
if "min_length" in meta and len(value) < meta["min_length"]:
    errors.append("too short")`,
      assertions: `assert errors == ["too short"]`,
      narrative: `len(value) < meta["min_length"] is the exact rule the metadata described (min_length=1) applied against a real value ("") — this is the validation step Field(...) would trigger automatically in real Pydantic.`,
      steps: [{ do: "Read the constraint back off the metadata", code: `meta["min_length"]` }, { do: "Check the value against it", code: `if len(value) < meta["min_length"]: errors.append("too short")` }] },
    { id: "pp_basic", task: "Register GET /items/{item_id} whose handler takes item_id: int and returns {\"item_id\": item_id}, call it directly with item_id=42.",
      why: "{item_id} in the path becomes a same-named function parameter — FastAPI extracts it straight from the URL and hands it in.",
      solution: `@app.get("/items/{item_id}")
def get_item(item_id: int):
    return {"item_id": item_id}

result = app.routes[("GET", "/items/{item_id}")](42)`,
      assertions: `assert result == {"item_id": 42}`,
      narrative: `The {item_id} placeholder in the path string and the item_id parameter in the function signature share a name on purpose — that's the whole mechanism, no extra wiring required.`,
      steps: [{ do: "Name the placeholder in the path", code: `"/items/{item_id}"` }, { do: "Receive it as a same-named parameter", code: `def get_item(item_id: int):` }] },
    { id: "pp_multi", task: "Register GET /users/{user_id}/orders/{order_id} with two path params, call it with user_id=7, order_id=99.",
      why: "A path can carry more than one parameter — each {name} maps to its own same-named argument, in the order they appear.",
      solution: `@app.get("/users/{user_id}/orders/{order_id}")
def get_order(user_id: int, order_id: int):
    return {"user_id": user_id, "order_id": order_id}

result = app.routes[("GET", "/users/{user_id}/orders/{order_id}")](7, 99)`,
      assertions: `assert result == {"user_id": 7, "order_id": 99}`,
      narrative: `Two placeholders, two parameters — user_id and order_id are extracted independently from their own segment of the URL, nested routes like this are how you express "an order that belongs to a user".`,
      steps: [{ do: "Two placeholders in the path", code: `"/users/{user_id}/orders/{order_id}"` }, { do: "Two matching parameters", code: `def get_order(user_id: int, order_id: int):` }] },
    { id: "rb_basic", task: `Register POST /items accepting a request body (a dict with name and price) and returning it with an id added, call it with {"name": "Widget", "price": 9.99}.`,
      why: "A POST handler's body is just another parameter — here a plain dict, standing in for the JSON payload a real client would send.",
      solution: `@app.post("/items")
def create_item(body: dict):
    return {"id": 1, **body}

result = app.routes[("POST", "/items")]({"name": "Widget", "price": 9.99})`,
      assertions: `assert result == {"id": 1, "name": "Widget", "price": 9.99}`,
      narrative: `{"id": 1, **body} builds a new dict starting with the generated id, then spreads every key from the incoming body on top — the shape a "created" response typically takes.`,
      steps: [{ do: "Accept the body as a parameter", code: `def create_item(body: dict):` }, { do: "Add a generated field to it", code: `{"id": 1, **body}` }] },
    { id: "rb_model_body", task: "Register POST /items/priced accepting the body as an ItemIn dataclass (name: str, price: float) instead of a raw dict, returning the name and a 10%-marked-up total.",
      why: "A typed request body (a model, not a bare dict) gives you dot-access AND documents exactly what the client must send — the more realistic FastAPI pattern.",
      solution: `from dataclasses import dataclass

@dataclass
class ItemIn:
    name: str
    price: float

@app.post("/items/priced")
def create_priced(body: ItemIn):
    return {"name": body.name, "total": round(body.price * 1.1, 2)}

result = app.routes[("POST", "/items/priced")](ItemIn(name="Widget", price=10.0))`,
      assertions: `assert result == {"name": "Widget", "total": 11.0}`,
      narrative: `body: ItemIn means the handler works with body.name / body.price directly, instead of the fragile body["name"] — the same ergonomic win a real Pydantic request-body model gives you.`,
      steps: [{ do: "Type the body as a model, not a dict", code: `def create_priced(body: ItemIn):` }, { do: "Use its fields by attribute", code: `body.name, body.price` }] },
    { id: "qp_basic_default", task: `Register GET /search with a query parameter q: str and an optional limit: int = 10 (a plain parameter with a default, not part of the {path}) — call it with q="cats" only.`,
      why: "A parameter that ISN'T in the {path} template becomes a query parameter automatically — a default value makes it optional.",
      solution: `@app.get("/search")
def search(q: str, limit: int = 10):
    return {"q": q, "limit": limit}

result = app.routes[("GET", "/search")](q="cats")`,
      assertions: `assert result == {"q": "cats", "limit": 10}`,
      narrative: `"/search" has no {q} or {limit} placeholder, so both become query parameters — real requests would be GET /search?q=cats; leaving limit out entirely falls back to its default of 10.`,
      steps: [{ do: "No placeholder for these in the path", code: `"/search"` }, { do: "So they're query params, one with a default", code: `def search(q: str, limit: int = 10):` }] },
    { id: "qp_override", task: "Call the same /search handler, but this time explicitly override limit to 5 (q=\"cats\", limit=5).",
      why: "Supplying a value for an optional query parameter overrides its default — exactly like ?q=cats&limit=5 in a real URL.",
      solution: `@app.get("/search")
def search(q: str, limit: int = 10):
    return {"q": q, "limit": limit}

result = app.routes[("GET", "/search")](q="cats", limit=5)`,
      assertions: `assert result == {"q": "cats", "limit": 5}`,
      narrative: `Passing limit=5 explicitly means the default (10) never gets used — the caller's value always wins, whether it arrives from a real query string or, here, a direct call.`,
      steps: [{ do: "Explicitly supply the optional one", code: `search(q="cats", limit=5)` }] },
    { id: "pd_put", task: `Register PUT /items/{item_id} that fully replaces an item, returning {"id": item_id, **body}, call it with item_id=3, body={"name": "New", "price": 5}.`,
      why: "PUT conventionally means REPLACE — the handler takes both a path param (which item) and a body (its new full contents).",
      solution: `@app.put("/items/{item_id}")
def replace_item(item_id: int, body: dict):
    return {"id": item_id, **body}

result = app.routes[("PUT", "/items/{item_id}")](3, {"name": "New", "price": 5})`,
      assertions: `assert result == {"id": 3, "name": "New", "price": 5}`,
      narrative: `PUT combines a path parameter (item_id — which resource) with a request body (its complete replacement contents) — the same two ingredients as a POST, just meaning "overwrite" instead of "create".`,
      steps: [{ do: "Identify the resource from the path", code: `item_id: int` }, { do: "Replace its contents from the body", code: `{"id": item_id, **body}` }] },
    { id: "pd_delete", task: "Register DELETE /items/{item_id} that removes an item from a dict store and returns {\"deleted\": item_id}, call it with item_id=2 (store starts with items 1, 2, 3).",
      why: "DELETE conventionally takes only a path parameter (which resource) — no body needed to remove something.",
      solution: `store = {1: "a", 2: "b", 3: "c"}

@app.delete("/items/{item_id}")
def delete_item(item_id: int):
    del store[item_id]
    return {"deleted": item_id}

result = app.routes[("DELETE", "/items/{item_id}")](2)`,
      assertions: `assert result == {"deleted": 2} and store == {1: "a", 3: "c"}`,
      narrative: `del store[item_id] removes the entry from the store as a side effect; the response just confirms what was deleted — DELETE handlers are usually this thin.`,
      steps: [{ do: "Remove it from the store", code: `del store[item_id]` }, { do: "Confirm what was deleted", code: `return {"deleted": item_id}` }] },
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
  {
    id: "lets-do-this-functions",
    title: "Let's Do This! — Functions",
    blurb: "Define, return, default/keyword/*args parameters, global, docstrings. Part 4 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: FUNCTIONS,
  },
  {
    id: "lets-do-this-oop",
    title: "Let's Do This! — OOP",
    blurb: "Classes, inheritance + super(), decorators (single and stacked), generators. Part 5 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: OOP,
  },
  {
    id: "lets-do-this-files-envs-logging",
    title: "Let's Do This! — Files, Envs & Logging",
    blurb: "File I/O, venv commands, project layout, env vars, logging + formatters. Part 6 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: FILES_ENVS_LOGGING,
  },
  {
    id: "lets-do-this-exceptions-typing-status",
    title: "Let's Do This! — Exceptions, Typing & Status Codes",
    blurb: "try/except/finally, custom exceptions, type hints, HTTP status codes. Part 7 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: EXCEPTIONS_TYPING_STATUS,
  },
  {
    id: "lets-do-this-api-requests",
    title: "Let's Do This! — API Requests & Responses",
    blurb: "FastAPI-style routes, response models, path/query params, request bodies, PUT/DELETE. Part 8 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: API_REQUESTS_RESPONSES,
  },
];
