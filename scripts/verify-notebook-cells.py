"""
Fast headless check of every Case Lab notebook's cells.

    python scripts/verify-notebook-cells.py            # all cases with a notebook
    python scripts/verify-notebook-cells.py --case=id  # one case
    python scripts/verify-notebook-cells.py --show     # print what each cell renders

WHY THIS EXISTS ALONGSIDE THE PLAYWRIGHT HARNESS
`npm run qa:notebooks` drives a real browser and is the honest end-to-end check,
but it costs roughly a minute per case. Authoring 5 cells across 38 cases means
running the cells hundreds of times, and a browser in that loop is unusable.

This runs the SAME execution semantics as the worker — exec the body, eval a
trailing expression, render DataFrames/Series — directly against the case CSV.
It answers "does this cell run and produce something" in seconds. It does not
replace the browser check; it makes the browser check something you reach
already knowing the Python is sound.

Kept deliberately in step with SESSION_PREAMBLE in lib/code/pyodide.worker.ts.
If the rendering rules there change, change them here.
"""

from __future__ import annotations

import ast
import contextlib
import glob
import io
import json
import os
import sys
import traceback

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = os.path.join(ROOT, "public", "case-lab")

args = sys.argv[1:]
ONLY = next((a.split("=", 1)[1] for a in args if a.startswith("--case=")), None)
SHOW = "--show" in args


def render(src: str, ns: dict) -> tuple[str, str | None]:
    """Run one cell the way the worker does. Returns (stdout, repr-of-tail)."""
    import numpy as np
    import pandas as pd

    buf = io.StringIO()
    value = None
    tree = ast.parse(src)
    tail = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        tail = ast.Expression(tree.body.pop().value)
    with contextlib.redirect_stdout(buf):
        exec(compile(tree, "<cell>", "exec"), ns)
        if tail is not None:
            value = eval(compile(tail, "<cell>", "eval"), ns)

    if isinstance(value, pd.DataFrame):
        return buf.getvalue(), value.to_string()
    if isinstance(value, pd.Series):
        return buf.getvalue(), value.to_string()
    if isinstance(value, np.generic):
        return buf.getvalue(), repr(value.item())
    if value is not None:
        return buf.getvalue(), repr(value)
    return buf.getvalue(), None


def verify(case_path: str) -> tuple[int, int, list[str]]:
    """Runs one case's notebook. Returns (cells_ok, cells_total, problems)."""
    import pandas as pd
    import numpy as np

    case = json.load(io.open(case_path, encoding="utf-8"))
    cid = case["id"]
    nb = case.get("notebook")
    if not nb or not nb.get("cells"):
        return 0, 0, []

    csv_path = os.path.join(ROOT, "public", case["dataset"]["file"].lstrip("/"))
    if not os.path.exists(csv_path):
        return 0, len(nb["cells"]), [f"{cid}: dataset missing at {csv_path}"]

    ns: dict = {"pd": pd, "np": np, "df": pd.read_csv(csv_path)}
    problems: list[str] = []
    ok = 0

    print(f"\n{cid}  ({len(nb['cells'])} cells, {len(ns['df']):,} rows)")
    for i, cell in enumerate(nb["cells"], 1):
        title = cell.get("title", f"cell {i}")
        try:
            out, tail = render(cell["code"], ns)
        except Exception:
            problems.append(f"{cid} cell {i} ({title}): {traceback.format_exc(limit=1).strip()}")
            print(f"  {i}. FAIL  {title}")
            continue

        if not out.strip() and tail is None:
            problems.append(f"{cid} cell {i} ({title}): ran but rendered nothing")
            print(f"  {i}. EMPTY {title}")
            continue

        ok += 1
        print(f"  {i}. ok    {title}")
        if SHOW:
            for line in (out.rstrip() + ("\n" + tail if tail else "")).splitlines():
                print(f"         {line}")

    return ok, len(nb["cells"]), problems


def main() -> None:
    paths = sorted(glob.glob(os.path.join(CASES, "*", "case.json")))
    if ONLY:
        paths = [p for p in paths if os.path.basename(os.path.dirname(p)) == ONLY]

    total_ok = total = 0
    problems: list[str] = []
    with_nb = 0

    for p in paths:
        ok, n, probs = verify(p)
        if n:
            with_nb += 1
        total_ok += ok
        total += n
        problems.extend(probs)

    print("\n" + "-" * 64)
    print(f"{with_nb} cases with a notebook — {total_ok}/{total} cells ran and rendered.")
    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)


if __name__ == "__main__":
    main()
