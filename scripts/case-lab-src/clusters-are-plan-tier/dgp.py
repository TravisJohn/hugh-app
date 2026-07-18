"""
Case Lab — "Clustering discovered a high-value segment — target it for upsell?"
Archetype: redundant clustering (no new information).

Data-generating process. api_calls_per_month, seat_count, and feature_count
are all tightly gated by plan_tier (free/pro/enterprise) by product design —
higher tiers unlock higher limits and more features. K-means on those three
columns "discovers" 3 clusters that are essentially just plan_tier restated
(very high agreement). Meanwhile feature_request_count is a genuinely
independent signal — barely related to plan_tier — that actually predicts
who upgrades next quarter. The "hidden segment" the clustering found isn't
new information (sales already has plan_tier in the CRM); the real upsell
signal was sitting in an unrelated column the whole time.

Run:  python scripts/case-lab-src/clusters-are-plan-tier/dgp.py
Emits: public/case-lab/clusters-are-plan-tier/data.csv  (12,000 rows)
Prints: agreement between cluster label and plan_tier vs. each signal's
        relationship to actual upgrade behavior.
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score
from sklearn.preprocessing import StandardScaler

SEED = 31
N = 12_000
OUT = os.path.join("public", "case-lab", "clusters-are-plan-tier", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    plan_tier = rng.choice(["free", "pro", "enterprise"], N, p=[0.6, 0.3, 0.1])
    tier_code = pd.Series(plan_tier).map({"free": 0, "pro": 1, "enterprise": 2}).to_numpy()

    # Gated by plan, by product design.
    api_calls_per_month = np.clip(
        rng.normal(np.select([tier_code == 0, tier_code == 1], [500, 8000], default=60000), 0.15 * np.select([tier_code == 0, tier_code == 1], [500, 8000], default=60000) + 200, N),
        0, None,
    ).round(0)
    seat_count = np.clip(
        rng.normal(np.select([tier_code == 0, tier_code == 1], [1.5, 8], default=45), 2.5, N), 1, None
    ).round(0)
    feature_count = np.clip(
        rng.normal(np.select([tier_code == 0, tier_code == 1], [3, 9], default=18), 1.5, N), 1, 20
    ).round(0)

    # Genuinely independent signal — how many feature requests they've filed.
    # Barely related to plan tier; this is what actually predicts upgrading.
    feature_request_count = np.clip(rng.poisson(2.2, N), 0, 15)

    z = -2.2 + 0.55 * (feature_request_count - 2.2) + 0.02 * (tier_code - 1)
    upgraded_next_quarter = rng.binomial(1, sigmoid(z))

    df = pd.DataFrame(
        {
            "account_id": np.arange(1, N + 1),
            "plan_tier": plan_tier,
            "api_calls_per_month": api_calls_per_month,
            "seat_count": seat_count,
            "feature_count": feature_count,
            "feature_request_count": feature_request_count,
            "upgraded_next_quarter": upgraded_next_quarter,
        }
    )
    return df


def main() -> None:
    df = generate()
    features = df[["api_calls_per_month", "seat_count", "feature_count"]].to_numpy()
    scaled = StandardScaler().fit_transform(features)

    km = KMeans(n_clusters=3, n_init=10, random_state=SEED)
    cluster = km.fit_predict(scaled)
    df["cluster"] = cluster

    tier_code = df.plan_tier.map({"free": 0, "pro": 1, "enterprise": 2}).to_numpy()
    ari_cluster_vs_tier = float(adjusted_rand_score(cluster, tier_code))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    # Does knowing the cluster predict upgrade any better than knowing plan_tier alone?
    upgrade_by_tier = df.groupby("plan_tier").upgraded_next_quarter.mean().to_dict()
    upgrade_by_cluster = df.groupby("cluster").upgraded_next_quarter.mean().to_dict()
    corr_requests_vs_upgrade = float(np.corrcoef(df.feature_request_count, df.upgraded_next_quarter)[0, 1])

    stats = {
        "rows": len(df),
        "ari_cluster_vs_plan_tier": round(ari_cluster_vs_tier, 3),
        "upgrade_rate_by_tier": {k: round(v, 3) for k, v in upgrade_by_tier.items()},
        "upgrade_rate_by_cluster": {int(k): round(v, 3) for k, v in upgrade_by_cluster.items()},
        "corr_feature_requests_vs_upgrade": round(corr_requests_vs_upgrade, 3),
        "overall_upgrade_rate": round(float(df.upgraded_next_quarter.mean()), 3),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
