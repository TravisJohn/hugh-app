"""
Case Lab — "Did migrating to the new warehouse make queries 40% faster?"
Archetype: confounding / selection bias (query size is the confounder).

Data-generating process. A platform team moved a slice of query workloads to a
new warehouse ("Nimbus"). Migration was NOT random: the small, cheap dashboard
queries were moved first, the heavy ETL/ML scans left on the old engine. Query
size (bytes_scanned_gb) drives runtime AND drove migration priority, so a naive
migrated-vs-not runtime comparison massively overstates the engine's true effect.

Run:  python scripts/case-lab-src/warehouse-migration/dgp.py
Emits: public/case-lab/warehouse-migration/data.csv  (12,000 rows)
Prints: naive vs size-adjusted runtime effect + 10 sample rows.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "warehouse-migration", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    # Query size in GB scanned — THE CONFOUNDER. Heavy right tail.
    bytes_scanned = np.clip(rng.lognormal(mean=0.7, sigma=1.1, size=N), 0.05, 400).round(2)
    log_bytes = np.log(bytes_scanned)

    query_type = rng.choice(
        ["dashboard", "adhoc", "etl", "ml_features"], N, p=[0.45, 0.30, 0.18, 0.07]
    )
    team = rng.choice(
        ["growth", "finance", "product", "platform", "ml"], N,
        p=[0.28, 0.22, 0.25, 0.15, 0.10],
    )
    table_count = np.clip(rng.poisson(3, N) + 1, 1, 20)
    scheduled_hour = rng.integers(0, 24, N)
    peak = ((scheduled_hour >= 9) & (scheduled_hour <= 18)).astype(int)

    # MIGRATION: small queries were moved first (selection on size).
    z = 1.4 - 1.15 * (log_bytes - log_bytes.mean())
    migrated = rng.binomial(1, sigmoid(z))

    # RUNTIME (log-seconds): dominated by size + joins + peak contention. The new
    # engine's TRUE effect is a modest ~8% speedup (tau on log-runtime).
    tau = np.log(0.92)
    w = (
        1.5
        + 0.85 * log_bytes
        + 0.06 * table_count
        + 0.20 * peak
        + tau * migrated
        + rng.normal(0, 0.25, N)
    )
    runtime_sec = np.exp(w).round(2)

    return pd.DataFrame(
        {
            "query_id": np.arange(1, N + 1),
            "team": team,
            "query_type": query_type,
            "bytes_scanned_gb": bytes_scanned,
            "table_count": table_count,
            "scheduled_hour": scheduled_hour,
            "migrated": migrated,
            "runtime_sec": runtime_sec,
        }
    )


def naive_pct(df: pd.DataFrame) -> float:
    a = df.loc[df.migrated == 1, "runtime_sec"].mean()
    b = df.loc[df.migrated == 0, "runtime_sec"].mean()
    return (a / b - 1.0) * 100.0


def adjusted_pct(df: pd.DataFrame, bins: int = 10) -> float:
    """Compare migrated vs not WITHIN query-size deciles, then size-weight — a
    dependency-free stand-in for a regression on log(bytes)."""
    df = df.copy()
    df["stratum"] = pd.qcut(df.bytes_scanned_gb, bins, labels=False, duplicates="drop")
    ratios, weights = [], []
    for _, g in df.groupby("stratum"):
        t = g.loc[g.migrated == 1, "runtime_sec"]
        c = g.loc[g.migrated == 0, "runtime_sec"]
        if len(t) and len(c):
            ratios.append(t.mean() / c.mean() - 1.0)
            weights.append(len(g))
    return float(np.average(ratios, weights=weights)) * 100.0


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    stats = {
        "rows": len(df),
        "share_migrated": round(df.migrated.mean(), 3),
        "naive_pct": round(naive_pct(df), 1),
        "adjusted_pct": round(adjusted_pct(df), 1),
        "mean_bytes_migrated": round(df.loc[df.migrated == 1, "bytes_scanned_gb"].mean(), 1),
        "mean_bytes_not": round(df.loc[df.migrated == 0, "bytes_scanned_gb"].mean(), 1),
        "mean_runtime_migrated": round(df.loc[df.migrated == 1, "runtime_sec"].mean(), 1),
        "mean_runtime_not": round(df.loc[df.migrated == 0, "runtime_sec"].mean(), 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
