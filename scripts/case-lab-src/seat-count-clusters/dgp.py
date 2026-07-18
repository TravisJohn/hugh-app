"""
Case Lab — "Usage clustering found 5 personas — target onboarding by persona?"
Archetype: feature-scaling dominance in clustering (SaaS variant).

Data-generating process. There IS a real 2-group usage split (power users vs
casual users: how many days/week they're active and how many features they
touch). But seat_count (company size, roughly 1-500 seats on the account) lives
on a much bigger numeric scale than the usage features (both under 30). Raw
k-means clusters almost entirely on seat_count — the "5 usage personas" are
really just account-size tiers, nearly independent of how people actually use
the product. Standardize first and the honest clustering recovers the real
2-group usage split instead.

Run:  python scripts/case-lab-src/seat-count-clusters/dgp.py
Emits: public/case-lab/seat-count-clusters/data.csv  (12,000 rows)
Prints: naive (unscaled) vs honest (standardized) cluster profiles.
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

SEED = 7
N = 12_000
OUT = os.path.join("public", "case-lab", "seat-count-clusters", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    true_segment = rng.binomial(1, 0.5, N)  # 0 = casual, 1 = power
    segment_label = np.where(true_segment == 1, "power", "casual")

    active_days_per_week = np.clip(
        rng.normal(np.where(true_segment == 1, 5.2, 1.6), 1.0, N), 0, 7
    ).round(1)
    features_used = np.clip(
        rng.normal(np.where(true_segment == 1, 11, 3), 2.2, N), 0, 20
    ).round(0)

    # Seat count — big-scale column (account size), only weakly tied to usage.
    plan = rng.choice(["starter", "team", "business"], N, p=[0.5, 0.35, 0.15])
    seat_base = np.where(true_segment == 1, 3.4, 3.2)  # lognormal mean, log-scale
    seat_count = np.round(np.clip(rng.lognormal(seat_base, 1.1, N), 1, 800))

    df = pd.DataFrame(
        {
            "account_id": np.arange(1, N + 1),
            "plan": plan,
            "active_days_per_week": active_days_per_week,
            "features_used": features_used,
            "seat_count": seat_count,
        }
    )
    df["_true_segment"] = segment_label
    return df


def cluster(df: pd.DataFrame):
    features_raw = df[["active_days_per_week", "features_used", "seat_count"]].to_numpy()

    naive_km = KMeans(n_clusters=5, n_init=10, random_state=SEED)
    naive_labels = naive_km.fit_predict(features_raw)

    scaled = StandardScaler().fit_transform(features_raw)
    best_k, best_score, best_labels = None, -1.0, None
    for k in range(2, 6):
        km = KMeans(n_clusters=k, n_init=10, random_state=SEED)
        labels = km.fit_predict(scaled)
        score = silhouette_score(scaled, labels)
        if score > best_score:
            best_k, best_score, best_labels = k, score, labels

    return naive_labels, best_k, best_labels


def main() -> None:
    df = generate()
    seat_quartile = pd.qcut(df.seat_count, 4, labels=False, duplicates="drop")
    true_seg_code = (df["_true_segment"] == "power").astype(int)

    naive_labels, honest_k, honest_labels = cluster(df)

    out = df.drop(columns=["_true_segment"]).copy()
    out["naive_cluster"] = naive_labels
    out["honest_cluster"] = honest_labels
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.to_csv(OUT, index=False)

    naive_profile = out.groupby("naive_cluster")[["active_days_per_week", "features_used", "seat_count"]].mean().round(1)
    honest_profile = out.groupby("honest_cluster")[["active_days_per_week", "features_used", "seat_count"]].mean().round(1)

    stats = {
        "rows": len(df),
        "honest_k": int(honest_k),
        "ari_naive_vs_true_segment": round(float(adjusted_rand_score(naive_labels, true_seg_code)), 3),
        "ari_honest_vs_true_segment": round(float(adjusted_rand_score(honest_labels, true_seg_code)), 3),
        "ari_honest_vs_seat_quartile": round(float(adjusted_rand_score(honest_labels, seat_quartile)), 3),
        "naive_days_range": [float(naive_profile.active_days_per_week.min()), float(naive_profile.active_days_per_week.max())],
        "naive_seat_range": [float(naive_profile.seat_count.min()), float(naive_profile.seat_count.max())],
        "honest_days_range": [float(honest_profile.active_days_per_week.min()), float(honest_profile.active_days_per_week.max())],
        "honest_features_range": [float(honest_profile.features_used.min()), float(honest_profile.features_used.max())],
    }
    print("STATS " + json.dumps(stats))
    print("NAIVE_PROFILE " + naive_profile.to_json())
    print("HONEST_PROFILE " + honest_profile.to_json())
    print("SAMPLE " + out.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
