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

export const LETS_DO_THIS_PACKS: DrillPack[] = [
  {
    id: "lets-do-this-values-types",
    title: "Let's Do This! — Values & Types",
    blurb: "Variables, strings, casting, booleans, None. Part 1 of the fundamentals series.",
    tag: "basics",
    lang: "python",
    content: VALUES_AND_TYPES,
  },
];
