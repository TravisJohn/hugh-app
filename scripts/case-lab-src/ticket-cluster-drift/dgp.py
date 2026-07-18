"""
Case Lab — "Ticket clustering found 4 issue types — route tickets by cluster ID?"
Archetype: cluster instability.

Data-generating process. Two synthetic "topic-loading" features (standing in
for embedding-derived features from ticket text) come from only 2 REAL
underlying groups, overlapping substantially. The support-ops team forced
k=4 (an elbow-plot ritual), so k-means has to arbitrarily subdivide the
overlapping cloud — and which way it subdivides is sensitive to the random
init, not to any real topic boundary. Re-running the identical clustering on
the identical data, with only the random seed different, reshuffles a
meaningful share of tickets into different "issue type" clusters.

Run:  python scripts/case-lab-src/ticket-cluster-drift/dgp.py
Emits: public/case-lab/ticket-cluster-drift/data.csv  (12,000 rows)
Prints: agreement between the two cluster runs.
"""
import json
import os

import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, confusion_matrix
from sklearn.preprocessing import StandardScaler

SEED = 17
N = 12_000
OUT = os.path.join("public", "case-lab", "ticket-cluster-drift", "data.csv")

# Only 2 REAL groups exist (e.g. "billing-flavored" vs "technical-flavored"
# language). The team insists on k=4 issue types.
CENTERS = np.array([[0, 0], [3.4, 3.4]], dtype=float)
STD = 1.35


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    true_group = rng.integers(0, 2, N)
    raw = CENTERS[true_group] + rng.normal(0, STD, size=(N, 2))

    urgency_score = np.clip(40 + raw[:, 0] * 11, 0, 100).round(1)
    complexity_score = np.clip(35 + raw[:, 1] * 13, 0, 100).round(1)

    df = pd.DataFrame(
        {
            "ticket_id": np.arange(1, N + 1),
            "urgency_score": urgency_score,
            "complexity_score": complexity_score,
        }
    )
    return df


def match_labels(run1: np.ndarray, run2: np.ndarray, k: int) -> np.ndarray:
    cm = confusion_matrix(run1, run2, labels=range(k))
    row_ind, col_ind = linear_sum_assignment(-cm)
    mapping = dict(zip(col_ind, row_ind))
    return np.array([mapping[label] for label in run2])


def main() -> None:
    df = generate()
    features = df[["urgency_score", "complexity_score"]].to_numpy()
    scaled = StandardScaler().fit_transform(features)

    model_a = KMeans(n_clusters=4, n_init=1, random_state=SEED).fit(scaled)
    model_b = KMeans(n_clusters=4, n_init=1, random_state=SEED + 5).fit(scaled)

    run1 = model_a.predict(scaled)
    run2_raw = model_b.predict(scaled)
    run2 = match_labels(run1, run2_raw, k=4)

    df["cluster_run1"] = run1
    df["cluster_run2"] = run2

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    same_cluster_share = float((run1 == run2).mean())
    ari = float(adjusted_rand_score(run1, run2))

    stats = {
        "rows": len(df),
        "pct_same_cluster_across_runs": round(same_cluster_share, 3),
        "ari_between_runs": round(ari, 3),
        "run1_sizes": pd.Series(run1).value_counts().sort_index().to_dict(),
        "run2_sizes": pd.Series(run2).value_counts().sort_index().to_dict(),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
