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

// ── Pack 2: CLI, logging & scheduling ────────────────────────────────────────
// A second, independent set of automation idioms — the stdlib modules a script
// reaches for to be runnable unattended (CLI args, logging, JSON I/O) rather
// than the resilience patterns (retry/timing/batching) the first pack covers.

const IMPORTS_II = `import argparse, json, logging, io, csv, os
from itertools import groupby, chain
from datetime import datetime, timedelta`;

export const AUTOMATION_II: DrillContent = {
  dataKind: "rows",
  cumulative: false,
  scenario: {
    title: "Automation II — CLI args, logging & scheduling",
    role: "The other half of running a script unattended: reading its own arguments, logging what happened, passing data as JSON, and scheduling repeat runs.",
    goal: "Each cell is one standard construct — mostly independent stdlib moves (argparse, logging, itertools, csv). Write each from memory.",
    outcome: "That's the second automation toolkit: parse CLI args, capture log records, round-trip JSON, generate a schedule, group/flatten with itertools, parse CSV from memory, read env config, dedupe, and back off exponentially.",
    setupCode: IMPORTS_II,
  },
  cells: [
    {
      id: "args",
      task: `Build an argparse parser with --name (required) and --count (int, default 1), and create args by parsing ["--name", "backup", "--count", "3"].`,
      why: "argparse is the standard way a script reads its own command-line arguments — parse_args() also accepts an explicit list, which is what makes it testable.",
      solution: `parser = argparse.ArgumentParser()
parser.add_argument("--name", required=True)
parser.add_argument("--count", type=int, default=1)
args = parser.parse_args(["--name", "backup", "--count", "3"])`,
      assertions: `assert args.name == "backup"
assert args.count == 3`,
      narrative: `add_argument declares each flag once; parse_args(["--name", "backup", ...]) parses a literal list instead of real sys.argv — the same call a script makes, just handed a fixed input so it's testable.`,
    },
    {
      id: "log_records",
      task: `Attach a handler that collects messages into log_records, then log "job started" (info) and "retrying step 2" (warning).`,
      why: "Capturing log output into a list — instead of printing it — is how you make logging behaviour testable.",
      solution: `log_records = []

class ListHandler(logging.Handler):
    def emit(self, record):
        log_records.append(record.getMessage())

logger = logging.getLogger("job")
logger.setLevel(logging.INFO)
logger.addHandler(ListHandler())
logger.propagate = False

logger.info("job started")
logger.warning("retrying step 2")`,
      assertions: `assert log_records == ["job started", "retrying step 2"]`,
      narrative: `A logging.Handler subclass's emit(record) runs for every log call; appending record.getMessage() to a plain list turns "what did the script log" into something an assert can check directly.`,
    },
    {
      id: "restored",
      task: `Create payload — {"job": "backup", "attempts": 2} as a sorted-key JSON string — then create restored by parsing it back.`,
      why: "json.dumps/loads is the standard way scripts hand structured data to each other — files, APIs, message queues.",
      solution: `payload = json.dumps({"job": "backup", "attempts": 2}, sort_keys=True)
restored = json.loads(payload)`,
      assertions: `assert payload == '{"attempts": 2, "job": "backup"}'
assert restored == {"job": "backup", "attempts": 2}`,
      narrative: `sort_keys=True makes the JSON string's key order deterministic (handy for diffs and tests); json.loads reverses it back into a plain dict, unchanged.`,
    },
    {
      id: "schedule_strs",
      task: `Create schedule_strs — 4 run times as "HH:MM" strings, 15 minutes apart, starting at 09:00.`,
      why: "Building a schedule with datetime + timedelta is the stdlib way to generate run times without a scheduling library.",
      solution: `start = datetime(2026, 1, 1, 9, 0)
schedule = [start + timedelta(minutes=15 * i) for i in range(4)]
schedule_strs = [t.strftime("%H:%M") for t in schedule]`,
      assertions: `assert schedule_strs == ["09:00", "09:15", "09:30", "09:45"]`,
      narrative: `timedelta(minutes=15 * i) offsets the start time by an increasing number of minutes each step; strftime("%H:%M") formats each resulting datetime back down to just hours and minutes.`,
    },
    {
      id: "grouped",
      task: `Create grouped — a dict of file extension to the files sharing it, using itertools.groupby on a pre-sorted file list.`,
      why: "groupby only groups CONSECUTIVE matching items — sorting by the same key first is what makes it actually group correctly.",
      solution: `files = ["a.csv", "b.csv", "c.txt", "d.txt", "e.pdf"]
files_sorted = sorted(files, key=lambda f: f.split(".")[-1])
grouped = {ext: list(group) for ext, group in groupby(files_sorted, key=lambda f: f.split(".")[-1])}`,
      assertions: `assert grouped == {"csv": ["a.csv", "b.csv"], "pdf": ["e.pdf"], "txt": ["c.txt", "d.txt"]}`,
      narrative: `groupby(iterable, key=...) only merges items that are ALREADY adjacent and share a key — sorted(files, key=...) first guarantees every extension's files sit together before groupby sees them.`,
    },
    {
      id: "flattened",
      task: "Create flattened — [[1, 2, 3], [4, 5], [6]] flattened into one list, using itertools.chain.from_iterable.",
      why: "chain.from_iterable is the itertools one-liner for flattening a list of lists — no nested loop required.",
      solution: `batches = [[1, 2, 3], [4, 5], [6]]
flattened = list(chain.from_iterable(batches))`,
      assertions: `assert flattened == [1, 2, 3, 4, 5, 6]`,
      narrative: `chain.from_iterable(batches) lazily walks each sub-list in turn as if they were one long sequence; list(...) collects that into an actual flat list.`,
    },
    {
      id: "csv_rows",
      task: `Create csv_rows — a list of dicts parsed from an in-memory CSV string, using csv.DictReader.`,
      why: "csv.DictReader plus io.StringIO parses CSV text without ever touching a real file on disk — handy for tests or in-memory data.",
      solution: `csv_text = "name,status\\nalpha,done\\nbeta,pending\\n"
reader = csv.DictReader(io.StringIO(csv_text))
csv_rows = list(reader)`,
      assertions: `assert csv_rows == [{"name": "alpha", "status": "done"}, {"name": "beta", "status": "pending"}]`,
      narrative: `io.StringIO(csv_text) wraps a string so it behaves like a file handle; csv.DictReader reads its first line as headers and turns every following line into a dict keyed by those headers.`,
    },
    {
      id: "env_config",
      task: `Set the JOB_RETRIES environment variable to "5", then create env_config — {"retries": ..., "timeout": ...} read from the environment with fallback defaults.`,
      why: "os.environ.get(key, default) is the standard way scripts read configuration that might be set externally, without crashing when it isn't.",
      solution: `os.environ["JOB_RETRIES"] = "5"
env_config = {
    "retries": int(os.environ.get("JOB_RETRIES", 3)),
    "timeout": int(os.environ.get("JOB_TIMEOUT", 30)),
}`,
      assertions: `assert env_config == {"retries": 5, "timeout": 30}`,
      narrative: `os.environ.get(key, default) returns the set value if present (retries, set to "5" above) or silently falls back (timeout, never set) — the standard shape for config that's sometimes overridden externally.`,
    },
    {
      id: "deduped_sorted",
      task: `Create deduped_sorted — the distinct tags from ["prod", "eu", "prod", "batch", "eu", "nightly"], alphabetically sorted.`,
      why: "set() then sorted() is the fast stdlib combo for de-duplicating and ordering in one line — no library needed.",
      solution: `tags = ["prod", "eu", "prod", "batch", "eu", "nightly"]
deduped_sorted = sorted(set(tags))`,
      assertions: `assert deduped_sorted == ["batch", "eu", "nightly", "prod"]`,
      narrative: `set(tags) drops every duplicate (order not guaranteed); sorted(...) then puts what's left back into a predictable, alphabetical order.`,
    },
    {
      id: "backoff_delays",
      task: "Create backoff_delays — exponential backoff delays for 6 retries (1, 2, 4, 8, …), capped at 30.",
      why: "Exponential backoff, capped at a ceiling, is the standard retry-delay shape — it backs off fast but never waits forever between tries.",
      solution: `backoff_delays = [min(2 ** i, 30) for i in range(6)]`,
      assertions: `assert backoff_delays == [1, 2, 4, 8, 16, 30]`,
      narrative: `2 ** i doubles the delay each retry (1, 2, 4, 8, 16, 32…); wrapping it in min(..., 30) caps it so the 6th retry waits 30 seconds instead of 32 — backoff that never grows unbounded.`,
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
  {
    id: "automation-ii",
    title: "Automation II — CLI, logging & scheduling",
    blurb: "argparse, logging capture, JSON, itertools, CSV parsing, env config. 10 reps.",
    tag: "automation",
    lang: "python",
    content: AUTOMATION_II,
  },
];
