"""
Case Lab — "The anomaly detector flagged these hosts as compromised — take them
offline?"
Archetype: anomaly-score precision (infra/security variant).

Data-generating process. A small true-compromise population (~1.5% of daily
host snapshots) shows an unusual signature (CPU spike, many outbound
connections, off-hours activity, new processes). But so do two entirely
legitimate host types: scheduled batch-job hosts (heavy CPU + off-hours runs)
and backup hosts (many outbound connections during transfer windows). An
unsupervised isolation forest fit on those metrics can't tell "unusual because
compromised" from "unusual because it's doing its job at 3am" — flagging the
most anomalous 1% of daily snapshots catches real compromise, but the flagged
bucket is mostly batch and backup hosts behaving normally.

Run:  python scripts/case-lab-src/server-anomaly-flags/dgp.py
Emits: public/case-lab/server-anomaly-flags/data.csv  (12,000 rows)
Prints: naive framing (flag rate) vs honest precision/recall of the flag
        against confirmed compromise.
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

SEED = 13
N = 12_000
OUT = os.path.join("public", "case-lab", "server-anomaly-flags", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    host_type = rng.choice(
        ["normal", "batch_job_host", "backup_host"], N, p=[0.82, 0.10, 0.08]
    )
    confirmed_compromised = rng.binomial(1, 0.015, N)
    is_bad = confirmed_compromised == 1

    # Compromise disguises itself as ONE of the two legit archetypes' profile
    # (a batch-job-like footprint or a backup-like footprint) — real evasive
    # behavior mimics normal-looking heavy jobs rather than standing apart.
    mimics_batch = is_bad & (rng.random(N) < 0.5)
    mimics_backup = is_bad & ~mimics_batch

    is_batch = (host_type == "batch_job_host") | mimics_batch
    is_backup = (host_type == "backup_host") | mimics_backup

    cpu_spike_pct = np.where(
        is_batch, rng.normal(68, 7, N), rng.normal(np.where(is_backup, 16, 8), 6, N)
    ).clip(0, 100).round(1)

    outbound_connections = np.where(
        is_backup, rng.poisson(175, N), rng.poisson(np.where(is_batch, 9, 6), N)
    )

    p_off_hours = np.where(is_batch, 0.68, np.where(is_backup, 0.12, 0.05))
    off_hours_activity = rng.binomial(1, p_off_hours)

    # The one dimension where compromise leaks slightly — new processes spun up
    # to run malicious code — but legit batch/backup hosts restart workers too,
    # so there's real overlap, not a clean separation.
    new_process_count = rng.poisson(np.where(is_bad, 2.6, np.where(is_batch | is_backup, 1.0, 0.2)))

    df = pd.DataFrame(
        {
            "snapshot_id": np.arange(1, N + 1),
            "host_type": host_type,
            "cpu_spike_pct": cpu_spike_pct,
            "outbound_connections": outbound_connections,
            "off_hours_activity": off_hours_activity,
            "new_process_count": new_process_count,
            "confirmed_compromised": confirmed_compromised,
        }
    )
    return df


def flag_anomalies(df: pd.DataFrame, contamination: float = 0.01) -> np.ndarray:
    features = df[
        ["cpu_spike_pct", "outbound_connections", "off_hours_activity", "new_process_count"]
    ].to_numpy()
    model = IsolationForest(contamination=contamination, random_state=SEED, n_estimators=200)
    pred = model.fit_predict(features)
    return (pred == -1).astype(int)


def main() -> None:
    df = generate()
    df["flagged_anomalous"] = flag_anomalies(df)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    flagged = df[df.flagged_anomalous == 1]
    tp = int(((df.flagged_anomalous == 1) & (df.confirmed_compromised == 1)).sum())
    fp = int(((df.flagged_anomalous == 1) & (df.confirmed_compromised == 0)).sum())
    total_bad = int(df.confirmed_compromised.sum())

    stats = {
        "rows": len(df),
        "n_flagged": int(df.flagged_anomalous.sum()),
        "n_confirmed_compromised": total_bad,
        "precision": round(tp / max(tp + fp, 1), 3),
        "recall": round(tp / max(total_bad, 1), 3),
        "flagged_breakdown_by_host_type": flagged.host_type.value_counts().to_dict(),
        "flagged_batch_or_backup_share": round(
            flagged.host_type.isin(["batch_job_host", "backup_host"]).mean(), 3
        ),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
