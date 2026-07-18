"""
Case Lab — "Clustering revealed a high-risk churn group — target it with an
intervention?"
Archetype: redundant clustering (no new information).

Data-generating process. session_length_min, actions_per_session, and
exports_count are all gated by account_status (trial/expired_trial/paid) by
product design — paid unlocks full usage, expired_trial caps it hard. K-means
on those three columns "discovers" 3 clusters that are essentially just
account_status restated (very high agreement). Meanwhile
onboarding_completion_pct is a genuinely independent signal — barely related
to account_status — that actually predicts who's retained 90 days later. The
"newly discovered risk group" isn't new information (account_status is
already in the CRM); the real retention signal was in a column nobody
clustered on.

Run:  python scripts/case-lab-src/clusters-are-trial-status/dgp.py
Emits: public/case-lab/clusters-are-trial-status/data.csv  (12,000 rows)
Prints: agreement between cluster label and account_status vs. each signal's
        relationship to actual 90-day retention.
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score
from sklearn.preprocessing import StandardScaler

SEED = 37
N = 12_000
OUT = os.path.join("public", "case-lab", "clusters-are-trial-status", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    account_status = rng.choice(["expired_trial", "trial", "paid"], N, p=[0.15, 0.4, 0.45])
    status_code = pd.Series(account_status).map({"expired_trial": 0, "trial": 1, "paid": 2}).to_numpy()

    session_length_min = np.clip(
        rng.normal(np.select([status_code == 0, status_code == 1], [2, 11], default=26), 1.8, N), 0, None
    ).round(1)
    actions_per_session = np.clip(
        rng.normal(np.select([status_code == 0, status_code == 1], [1.5, 7], default=17), 1.5, N), 0, None
    ).round(1)
    exports_count = np.clip(
        rng.poisson(np.select([status_code == 0, status_code == 1], [0.1, 1.4], default=6.5)), 0, None
    )

    # Genuinely independent signal — how much of onboarding they actually completed.
    onboarding_completion_pct = np.clip(rng.normal(55, 22, N), 0, 100).round(1)

    z = -1.6 + 0.045 * (onboarding_completion_pct - 55) + 0.03 * (status_code - 1)
    retained_90d = rng.binomial(1, sigmoid(z))

    df = pd.DataFrame(
        {
            "account_id": np.arange(1, N + 1),
            "account_status": account_status,
            "session_length_min": session_length_min,
            "actions_per_session": actions_per_session,
            "exports_count": exports_count,
            "onboarding_completion_pct": onboarding_completion_pct,
            "retained_90d": retained_90d,
        }
    )
    return df


def main() -> None:
    df = generate()
    features = df[["session_length_min", "actions_per_session", "exports_count"]].to_numpy()
    scaled = StandardScaler().fit_transform(features)

    km = KMeans(n_clusters=3, n_init=10, random_state=SEED)
    cluster = km.fit_predict(scaled)
    df["cluster"] = cluster

    status_code = df.account_status.map({"expired_trial": 0, "trial": 1, "paid": 2}).to_numpy()
    ari_cluster_vs_status = float(adjusted_rand_score(cluster, status_code))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    retain_by_status = df.groupby("account_status").retained_90d.mean().to_dict()
    retain_by_cluster = df.groupby("cluster").retained_90d.mean().to_dict()
    corr_onboarding_vs_retain = float(np.corrcoef(df.onboarding_completion_pct, df.retained_90d)[0, 1])

    stats = {
        "rows": len(df),
        "ari_cluster_vs_account_status": round(ari_cluster_vs_status, 3),
        "retain_rate_by_status": {k: round(v, 3) for k, v in retain_by_status.items()},
        "retain_rate_by_cluster": {int(k): round(v, 3) for k, v in retain_by_cluster.items()},
        "corr_onboarding_vs_retain": round(corr_onboarding_vs_retain, 3),
        "overall_retain_rate": round(float(df.retained_90d.mean()), 3),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
