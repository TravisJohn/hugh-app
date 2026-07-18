"""
Case Lab — "We found 4 stable customer personas — commit next quarter's ad
budget by persona?"
Archetype: cluster instability.

Data-generating process. engagement_score and value_score come from 4
genuinely overlapping latent groups (centers spaced closer together than
their spread) — real customer behavior rarely forms clean, well-separated
blobs. Fit k-means(k=4) on one month's random sample of customers, then again
on a *different* random sample the next month (the same underlying
population, just a refreshed pull) and apply both fitted models to the full
customer base. Because the clusters overlap, a large share of customers land
in a different cluster from one run to the next — the "4 stable personas"
aren't reproducible at all.

Run:  python scripts/case-lab-src/persona-reruns/dgp.py
Emits: public/case-lab/persona-reruns/data.csv  (12,000 rows)
Prints: agreement between the two cluster runs (label-matched % same cluster,
        and adjusted Rand index).
"""
import json
import os

import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, confusion_matrix
from sklearn.preprocessing import StandardScaler

SEED = 23
N = 12_000
OUT = os.path.join("public", "case-lab", "persona-reruns", "data.csv")

# Only 2 REAL groups exist. The team insists on k=4 (an elbow-plot ritual, not
# genuine structure), so k-means has to arbitrarily subdivide — and which way
# it subdivides is sensitive to the random init, not to any real boundary.
CENTERS = np.array([[0, 0], [3.4, 3.4]], dtype=float)
STD = 1.35


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    true_group = rng.integers(0, 2, N)
    raw = CENTERS[true_group] + rng.normal(0, STD, size=(N, 2))

    engagement_score = np.clip(40 + raw[:, 0] * 12, 0, 100).round(1)
    value_score = np.clip(300 + raw[:, 1] * 90, 10, 3000).round(2)

    df = pd.DataFrame(
        {
            "customer_id": np.arange(1, N + 1),
            "engagement_score": engagement_score,
            "value_score": value_score,
        }
    )
    return df


def match_labels(run1: np.ndarray, run2: np.ndarray, k: int) -> np.ndarray:
    """Relabel run2 to best match run1's cluster IDs via the Hungarian algorithm
    on the overlap matrix (clustering labels are arbitrary, so raw label ids
    aren't comparable without this)."""
    cm = confusion_matrix(run1, run2, labels=range(k))
    row_ind, col_ind = linear_sum_assignment(-cm)
    mapping = dict(zip(col_ind, row_ind))
    return np.array([mapping[label] for label in run2])


def main() -> None:
    df = generate()
    features = df[["engagement_score", "value_score"]].to_numpy()
    scaled = StandardScaler().fit_transform(features)

    # Same data both times — only the random initialization differs, exactly
    # like re-running the same clustering job on two different days without
    # pinning a seed. n_init=1 (a single random start, not a best-of-N search)
    # matches how a lot of "run k-means real quick" analysis actually happens.
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
