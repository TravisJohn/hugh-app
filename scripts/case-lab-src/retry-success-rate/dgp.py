"""
Case Lab — "Auto-retries pushed task success to 99% — retries fixed reliability?"
Archetype: Simpson's paradox (a task-mix shift reverses the aggregate).

Data-generating process. The platform rolled out aggressive auto-retries (1 -> 3)
and overall task success rose. But the rollout coincided with a monitoring push
that flooded the schedulers with cheap SENSOR tasks (near-100% success). That mix
shift is what lifts the aggregate. WITHIN every task class, success actually FELL
in the "after" period — a real regression (a dependency upgrade) that retries did
not fix. The headline rise hides a degradation on the work that matters.

Run:  python scripts/case-lab-src/retry-success-rate/dgp.py
Emits: public/case-lab/retry-success-rate/data.csv  (12,000 rows)
Prints: overall success before/after AND per-class success before/after.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "retry-success-rate", "data.csv")

CLASSES = ["sensor", "transform", "load", "ml"]
# Base success rate per class in the "before" period.
BASE = {"sensor": 0.99, "transform": 0.90, "load": 0.88, "ml": 0.85}
# Real regression in "after": EVERY class drops ~2 points (retries don't fix it).
DROP = 0.02
# Task mix by period — the monitoring push floods "after" with sensor tasks.
MIX_BEFORE = {"sensor": 0.30, "transform": 0.30, "load": 0.25, "ml": 0.15}
MIX_AFTER = {"sensor": 0.75, "transform": 0.10, "load": 0.10, "ml": 0.05}


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    period = rng.choice(["before", "after"], N)
    task_class = np.empty(N, dtype=object)
    for p, mix in (("before", MIX_BEFORE), ("after", MIX_AFTER)):
        m = period == p
        task_class[m] = rng.choice(CLASSES, m.sum(), p=[mix[c] for c in CLASSES])

    max_retries = np.where(period == "after", 3, 1)
    dag_id = np.array([f"dag_{i % 180:03d}" for i in range(N)])
    duration_sec = np.where(
        task_class == "sensor",
        rng.uniform(1, 20, N),
        rng.lognormal(mean=3.5, sigma=0.8, size=N),
    ).round(1)

    # Success: base rate per class, minus the real "after" regression.
    p_succ = np.array([BASE[c] for c in task_class])
    p_succ = p_succ - np.where(period == "after", DROP, 0.0)
    succeeded = rng.binomial(1, np.clip(p_succ, 0, 1))

    return pd.DataFrame(
        {
            "run_id": np.arange(1, N + 1),
            "dag_id": dag_id,
            "task_class": task_class,
            "period": period,
            "max_retries": max_retries,
            "duration_sec": duration_sec,
            "succeeded": succeeded,
        }
    )


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    overall = df.groupby("period").succeeded.mean().mul(100).round(1).to_dict()
    per_class = {}
    for c in CLASSES:
        sub = df[df.task_class == c].groupby("period").succeeded.mean().mul(100).round(1)
        per_class[c] = sub.to_dict()
    sensor_share = df.groupby("period").apply(
        lambda g: round((g.task_class == "sensor").mean(), 3), include_groups=False
    ).to_dict()

    stats = {
        "rows": len(df),
        "overall_success": overall,
        "per_class_success": per_class,
        "sensor_share": sensor_share,
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
