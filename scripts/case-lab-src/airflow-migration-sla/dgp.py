"""
Case Lab — "SLA breaches spiked after the Airflow 2 migration — roll back?"
Archetype: confounding / selection bias (DAG complexity is the confounder).

Data-generating process. A platform team moved DAGs onto a new scheduler
("Airflow 2"). Migration was NOT random: the heaviest, most dependency-laden DAGs
were migrated first (they were the ones ops most wanted off the old box). DAG
complexity drives SLA breaches AND drove migration order, so migrated DAGs breach
more because they were already the fragile ones — not because the new scheduler is
worse. Its TRUE effect is roughly neutral (a hair better).

Run:  python scripts/case-lab-src/airflow-migration-sla/dgp.py
Emits: public/case-lab/airflow-migration-sla/data.csv  (12,000 rows)
Prints: naive vs complexity-adjusted breach-rate effect + samples.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "airflow-migration-sla", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    # DAG complexity — THE CONFOUNDER. Heavy tail of big DAGs.
    task_count = np.clip(rng.lognormal(mean=2.4, sigma=0.7, size=N).round(), 2, 200).astype(int)
    upstream_deps = np.clip((task_count * rng.uniform(0.1, 0.5, N)).round(), 0, 60).astype(int)
    data_volume_gb = np.clip(rng.lognormal(mean=1.0, sigma=1.0, size=N), 0.1, 500).round(2)
    scheduled_hour = rng.integers(0, 24, N)
    peak = ((scheduled_hour >= 1) & (scheduled_hour <= 5)).astype(int)  # nightly batch crunch

    log_tasks = np.log(task_count)

    # MIGRATION: the heaviest DAGs were moved first (selection on complexity).
    z = -0.6 + 1.30 * (log_tasks - log_tasks.mean()) + 0.03 * upstream_deps
    migrated = rng.binomial(1, sigmoid(z))

    # SLA BREACH: driven by complexity, deps, volume, nightly contention. The new
    # scheduler's TRUE effect is a small improvement (tau slightly negative).
    tau = -0.12
    w = (
        -2.4
        + 0.95 * (log_tasks - log_tasks.mean())
        + 0.04 * upstream_deps
        + 0.30 * np.log(data_volume_gb)
        + 0.45 * peak
        + tau * migrated
    )
    sla_breached = rng.binomial(1, sigmoid(w))

    return pd.DataFrame(
        {
            "run_id": np.arange(1, N + 1),
            "dag_id": np.array([f"dag_{i % 240:03d}" for i in range(N)]),
            "task_count": task_count,
            "upstream_deps": upstream_deps,
            "data_volume_gb": data_volume_gb,
            "scheduled_hour": scheduled_hour,
            "migrated": migrated,
            "sla_breached": sla_breached,
        }
    )


def naive_effect(df: pd.DataFrame) -> float:
    a = df.loc[df.migrated == 1, "sla_breached"].mean()
    b = df.loc[df.migrated == 0, "sla_breached"].mean()
    return (a - b) * 100.0


def adjusted_effect(df: pd.DataFrame, bins: int = 10) -> float:
    """Compare migrated vs not WITHIN task-count deciles, complexity-weighted."""
    df = df.copy()
    df["stratum"] = pd.qcut(df.task_count, bins, labels=False, duplicates="drop")
    diffs, weights = [], []
    for _, g in df.groupby("stratum"):
        t = g.loc[g.migrated == 1, "sla_breached"]
        c = g.loc[g.migrated == 0, "sla_breached"]
        if len(t) and len(c):
            diffs.append(t.mean() - c.mean())
            weights.append(len(g))
    return float(np.average(diffs, weights=weights)) * 100.0


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    stats = {
        "rows": len(df),
        "share_migrated": round(df.migrated.mean(), 3),
        "breach_migrated": round(df.loc[df.migrated == 1, "sla_breached"].mean() * 100, 1),
        "breach_not": round(df.loc[df.migrated == 0, "sla_breached"].mean() * 100, 1),
        "naive_effect_pts": round(naive_effect(df), 1),
        "adjusted_effect_pts": round(adjusted_effect(df), 1),
        "mean_tasks_migrated": round(df.loc[df.migrated == 1, "task_count"].mean(), 1),
        "mean_tasks_not": round(df.loc[df.migrated == 0, "task_count"].mean(), 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
