"""Check a decrypted DB backup against the live database, row for row.

    python scripts/verify-backup.py <path/to/data.sql> [env-file]

A dump that names every table is not a dump that holds every row, and the
difference is invisible until the day you need it. `backup-db.sh` asserts that
the file is not hollow; this asserts that it is complete.

Counting rows means parsing the INSERT statements, and that needs real care:
note_messages holds AI chat about code, so message bodies contain semicolons at
end-of-line and unbalanced parentheses. Splitting on ';\n' truncates that one
statement and under-reports the table by ~50 rows — which looks exactly like a
backup that silently lost data. Track quote and paren state instead.

Only `public` tables can be checked automatically: PostgREST does not expose the
`auth` or `storage` schemas, so their counts are printed for eyeballing.

Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (env or .env.local).
"""

import io
import os
import re
import sys
import urllib.request

INSERT = re.compile(r'INSERT INTO "([a-z_]+)"\."([a-z_]+)"[^)]*\)\s*VALUES\s*')


def scan(sql, start):
    """From the char after VALUES, return (top-level tuple count, index of ';')."""
    count = depth = 0
    i, in_string = start, False
    while i < len(sql):
        c = sql[i]
        if in_string:
            if c == "'":
                if i + 1 < len(sql) and sql[i + 1] == "'":
                    i += 2  # '' is an escaped quote, not a terminator
                    continue
                in_string = False
        elif c == "'":
            in_string = True
        elif c == "(":
            if depth == 0:
                count += 1
            depth += 1
        elif c == ")":
            depth -= 1
        elif c == ";" and depth == 0:
            return count, i
        i += 1
    return count, i


def parse_dump(path):
    sql = io.open(path, encoding="utf-8", errors="replace").read()
    counts, pos = {}, 0
    while True:
        m = INSERT.search(sql, pos)
        if not m:
            return counts
        n, end = scan(sql, m.end())
        key = f"{m.group(1)}.{m.group(2)}"
        counts[key] = counts.get(key, 0) + n
        pos = end


def load_env(path):
    """Environment wins; the file only fills gaps, so CI needs no .env.local."""
    env = dict(os.environ)
    try:
        for line in io.open(path, encoding="utf-8", errors="replace"):
            m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
            if m and env.get(m.group(1)) is None:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    except OSError:
        pass
    url, key = env.get("NEXT_PUBLIC_SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    return url, key


def live_count(base, key, table):
    req = urllib.request.Request(
        f"{base}/rest/v1/{table}?select=*&limit=1",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "count=exact",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return int(r.headers.get("Content-Range", "/0").split("/")[-1])


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    dump = parse_dump(sys.argv[1])
    base, key = load_env(sys.argv[2] if len(sys.argv) > 2 else ".env.local")

    print(f"{'table':38} {'dump':>7} {'live':>7}  status")
    print("-" * 68)
    mismatches = 0
    for table in sorted(t for t in dump if t.startswith("public.")):
        want = dump[table]
        try:
            got = live_count(base, key, table.split(".", 1)[1])
        except Exception as err:  # a dropped query is not a matching count
            print(f"{table:38} {want:>7} {'?':>7}  UNCHECKED ({err})")
            mismatches += 1
            continue
        if got != want:
            mismatches += 1
        print(f"{table:38} {want:>7} {got:>7}  {'ok' if got == want else 'MISMATCH'}")

    print("-" * 68)
    for table in sorted(t for t in dump if not t.startswith("public.")):
        print(f"{table:38} {dump[table]:>7} {'-':>7}  (not exposed via PostgREST)")

    total = sum(dump.values())
    print(f"\nnon-empty tables: {len(dump)}   rows: {total}   mismatches: {mismatches}")
    if mismatches:
        print("\nThis dump does not match the live database — do not trust it.")
        return 1
    print("\nEvery public table matches. Note this proves the rows are present,")
    print("not that they replay: a restore into a scratch project is still owed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
