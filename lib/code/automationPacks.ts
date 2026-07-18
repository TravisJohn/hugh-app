// Automation practice pack — stdlib scripting idioms (decorators, pathlib,
// batching, config parsing, context managers). Pure Python, no pandas: this is
// script/utility territory, not tabular analysis, so cells use the plain
// `rows` list-of-dicts convention instead of a DataFrame.
//
// Independent reps (cumulative: false) — most don't touch `rows` at all past
// the first few; the shared thread is "constructs you reach for when a script
// has to run unattended." Every solution + hidden assert verified in real
// CPython before shipping.

import { pyRowsLiteral, type DataRow, type DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

const JOB_ROWS: DataRow[] = [
  { name: "sales_2024_01.csv", kind: "csv", size_kb: 420, attempts: 0, status: "pending" },
  { name: "sales_2024_02.csv", kind: "csv", size_kb: 0, attempts: 2, status: "failed" },
  { name: "logs_2024_01.txt", kind: "txt", size_kb: 55, attempts: 1, status: "pending" },
  { name: "sales_2024_03.csv", kind: "csv", size_kb: 810, attempts: 0, status: "pending" },
  { name: "sales_2024_01.csv", kind: "csv", size_kb: 420, attempts: 0, status: "done" },
  { name: "report_2024_01.pdf", kind: "pdf", size_kb: 130, attempts: 0, status: "pending" },
];

const IMPORTS = `from pathlib import Path
from functools import wraps
from time import perf_counter
from contextlib import contextmanager`;

export const AUTOMATION: DrillContent = {
  dataKind: "rows",
  cumulative: false,
  scenario: {
    title: "Automation — scripting a job queue",
    role: "A small batch of files needs unattended processing: some pending, one already failed twice. These are the stdlib moves that keep a script resilient — decorators, pathlib, batching, config, logging.",
    goal: "Each cell is one standard automation construct, mostly independent. A few read the shared `rows` job list; most stand alone (a decorator, a context manager) — write each from memory.",
    outcome: "That's the automation toolkit: filter/dedupe a file list, retry + time a flaky call, batch a queue, parse messy input safely, and log start/end with a context manager.",
    setupCode: `${IMPORTS}\n${pyRowsLiteral(JOB_ROWS)}`,
    dataset: JOB_ROWS,
  },
  cells: [
    {
      id: "csv_names",
      task: `Create csv_names — the name of every row whose name ends in ".csv".`,
      why: "endswith() is the everyday extension check before you touch a file — the glob-lite filter.",
      focus: ["name"],
      solution: `csv_names = [r["name"] for r in rows if r["name"].endswith(".csv")]`,
      assertions: `assert csv_names == ["sales_2024_01.csv", "sales_2024_02.csv", "sales_2024_03.csv", "sales_2024_01.csv"]`,
      narrative: `r["name"].endswith(".csv") checks the extension without splitting the string by hand; the comprehension keeps only the matches.`,
    },
    {
      id: "stem",
      task: "Create stem — the first row's filename with its extension removed.",
      why: "pathlib.Path gives you the filename-minus-extension without manual string slicing.",
      focus: ["name"],
      solution: `stem = Path(rows[0]["name"]).stem`,
      assertions: `assert stem == "sales_2024_01"`,
      narrative: `Path(name) wraps the string as a path object; .stem is the name without its suffix — the reflex over rsplit(".", 1)[0].`,
    },
    {
      id: "unique_names",
      task: "Create unique_names — the distinct filenames, in their first-seen order.",
      why: "A seen-set is the standard way to dedupe while keeping order — duplicate filenames slip into file lists constantly.",
      focus: ["name"],
      solution: `seen = set()
unique_names = []
for r in rows:
    if r["name"] not in seen:
        seen.add(r["name"])
        unique_names.append(r["name"])`,
      assertions: `assert unique_names == ["sales_2024_01.csv", "sales_2024_02.csv", "logs_2024_01.txt", "sales_2024_03.csv", "report_2024_01.pdf"]`,
      narrative: `A set tracks what's already been kept; the loop only appends a name the first time it appears, so later duplicates are silently skipped.`,
    },
    {
      id: "pending_retryable",
      task: "Create pending_retryable — the names of failed rows with fewer than 3 attempts.",
      why: "This is retry-queue logic: only re-run what failed and hasn't exhausted its attempts.",
      focus: ["status", "attempts"],
      solution: `pending_retryable = [r["name"] for r in rows if r["status"] == "failed" and r["attempts"] < 3]`,
      assertions: `assert pending_retryable == ["sales_2024_02.csv"]`,
      narrative: `Two conditions combine in the filter: status selects what broke, attempts caps how many more tries are allowed before giving up.`,
    },
    {
      id: "result",
      task: "Write a retry(times) decorator and apply it to a function that fails twice then succeeds; create result as its return value.",
      why: "functools.wraps preserves the wrapped function's name; retrying inside try/except is the core resilience pattern for automation.",
      solution: `calls = 0

def retry(times):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            last_error = None
            for _ in range(times):
                try:
                    return fn(*args, **kwargs)
                except ValueError as e:
                    last_error = e
            raise last_error
        return wrapper
    return decorator

@retry(3)
def flaky():
    global calls
    calls += 1
    if calls < 3:
        raise ValueError("not yet")
    return "ok"

result = flaky()`,
      assertions: `assert result == "ok"
assert calls == 3
assert flaky.__name__ == "flaky"`,
      narrative: `@retry(3) wraps flaky() so each call retries on ValueError up to 3 times; @wraps(fn) inside the decorator keeps flaky.__name__ as "flaky" instead of "wrapper".`,
    },
    {
      id: "total",
      task: "Write a timed decorator that records elapsed time on the wrapper, apply it to a two-argument add function, and create total as its result.",
      why: "Instrumentation you bolt on without changing the call signature — the pattern behind most timing/logging decorators.",
      solution: `def timed(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        start = perf_counter()
        value = fn(*args, **kwargs)
        wrapper.last_duration = perf_counter() - start
        return value
    return wrapper

@timed
def slow_add(a, b):
    return a + b

total = slow_add(2, 3)`,
      assertions: `assert total == 5
assert slow_add.last_duration >= 0`,
      narrative: `perf_counter() before and after the call gives elapsed time; storing it on wrapper.last_duration exposes it without changing what slow_add returns.`,
    },
    {
      id: "batches",
      task: "Write a chunk(items, size) helper and create batches — rows split into chunks of 4.",
      why: "Slicing by stride is the standard way to batch a queue for rate-limited or memory-bound processing.",
      solution: `def chunk(items, size):
    return [items[i:i + size] for i in range(0, len(items), size)]

batches = chunk(rows, 4)`,
      assertions: `assert len(batches) == 2
assert len(batches[0]) == 4
assert len(batches[1]) == 2`,
      narrative: `range(0, len(items), size) walks the list in fixed-size steps; each items[i:i+size] slice is one batch — the last one just runs short.`,
    },
    {
      id: "safe_size_bad",
      task: "Write a safe_size(value, default=0) helper that falls back on bad input, and create safe_size_bad by calling it on a non-numeric string with default=-1.",
      why: "try/except with a default is how automation scripts survive dirty input instead of crashing the whole batch.",
      solution: `def safe_size(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default

safe_size_bad = safe_size("n/a", default=-1)`,
      assertions: `assert safe_size_bad == -1
assert safe_size(rows[0]["size_kb"]) == 420`,
      narrative: `int(value) raises ValueError on something like "n/a"; catching it and returning default keeps the caller from crashing on one bad record.`,
    },
    {
      id: "report",
      task: `Create report — one line per row as "name: status", joined by newlines.`,
      why: "An f-string generator joined by newlines is the fast way to turn structured records into a human-readable log.",
      focus: ["name", "status"],
      solution: `report = "\\n".join(f"{r['name']}: {r['status']}" for r in rows)`,
      assertions: `assert report.count("\\n") == len(rows) - 1
assert report.splitlines()[0] == "sales_2024_01.csv: pending"
assert report.splitlines()[1] == "sales_2024_02.csv: failed"`,
      narrative: `The generator formats each row as "name: status"; "\\n".join stitches them into one multi-line report — no loop, no manual concatenation.`,
    },
    {
      id: "config",
      task: `Create config — a dict parsed from a "KEY=VALUE" per-line config string.`,
      why: "Splitting each line on the first '=' is how scripts read .env-style config without pulling in a library.",
      solution: `raw_config = "RETRY_LIMIT=3\\nBATCH_SIZE=4\\nDRY_RUN=false"
config = dict(line.split("=", 1) for line in raw_config.splitlines())`,
      assertions: `assert config == {"RETRY_LIMIT": "3", "BATCH_SIZE": "4", "DRY_RUN": "false"}`,
      narrative: `splitlines() breaks the block into lines; split("=", 1) cuts each on only the first "=" (so a value containing "=" stays intact); dict(...) collects the pairs.`,
    },
    {
      id: "logged",
      task: `Write a job(name) context manager that logs "start:name" then "end:name" around a block, and create logged as the resulting event list.`,
      why: "@contextmanager turns a generator into a with-block — guaranteed start/end bookkeeping even if the body raises.",
      solution: `events = []

@contextmanager
def job(name):
    events.append(f"start:{name}")
    try:
        yield
    finally:
        events.append(f"end:{name}")

with job("extract"):
    events.append("run:extract")

logged = events`,
      assertions: `assert logged == ["start:extract", "run:extract", "end:extract"]`,
      narrative: `Code before yield runs on entry, code after (in finally) runs on exit — even if the with-block raises — so start/end bookkeeping always balances.`,
    },
  ],
};

export const AUTOMATION_PACKS: DrillPack[] = [
  {
    id: "automation",
    title: "Automation",
    blurb: "Retry decorators, pathlib, batching, safe parsing, context managers. 11 reps.",
    tag: "automation",
    lang: "python",
    content: AUTOMATION,
  },
];
