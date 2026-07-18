"""
Case Lab — "PC1 explains 80% of the variance — build the health score on it?"
Archetype: explained variance != business relevance.

Data-generating process. Four account metrics feed a customer-health PCA:
session_count (0-2,000, huge scale), feature_adoption_count (0-10),
support_tickets (0-20), tenure_months (0-60). session_count's raw variance
dwarfs the other three, so on unscaled features PC1 is almost entirely
session_count and "explains" most of the total variance. But churn is actually
driven by feature_adoption_count (protective) and support_tickets (risk) —
session_count barely matters. PC1 ends up a poor churn signal despite its
huge "explained variance" share; feature_adoption_count alone predicts churn
far better.

Run:  python scripts/case-lab-src/health-score-pca/dgp.py
Emits: public/case-lab/health-score-pca/data.csv  (12,000 rows)
Prints: PC1's variance share vs its correlation with churn, next to a raw
        feature's correlation with churn.
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA

SEED = 17
N = 12_000
OUT = os.path.join("public", "case-lab", "health-score-pca", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    tenure_months = rng.integers(1, 61, N)
    feature_adoption_count = np.clip(rng.poisson(4, N), 0, 10)
    support_tickets = np.clip(rng.poisson(2, N), 0, 20)
    # session_count: big scale, weakly-to-not related to the drivers of churn.
    session_count = np.clip(rng.lognormal(6.0, 1.0, N), 5, 3000).round(0)

    z = (
        -0.9
        - 0.55 * (feature_adoption_count - 4)
        + 0.35 * (support_tickets - 2)
        - 0.01 * (tenure_months - 30)
    )
    churned = rng.binomial(1, sigmoid(z))

    df = pd.DataFrame(
        {
            "account_id": np.arange(1, N + 1),
            "tenure_months": tenure_months,
            "session_count": session_count,
            "feature_adoption_count": feature_adoption_count,
            "support_tickets": support_tickets,
            "churned": churned,
        }
    )
    return df


def main() -> None:
    df = generate()

    features = df[["session_count", "feature_adoption_count", "support_tickets", "tenure_months"]].to_numpy()
    pca = PCA(n_components=4, random_state=SEED)
    scores = pca.fit_transform(features)
    df["pc1_score"] = scores[:, 0].round(2)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    corr_pc1_churn = float(np.corrcoef(df.pc1_score, df.churned)[0, 1])
    corr_adoption_churn = float(np.corrcoef(df.feature_adoption_count, df.churned)[0, 1])
    corr_tickets_churn = float(np.corrcoef(df.support_tickets, df.churned)[0, 1])
    corr_sessions_churn = float(np.corrcoef(df.session_count, df.churned)[0, 1])

    stats = {
        "rows": len(df),
        "explained_variance_ratio": [round(float(v), 3) for v in pca.explained_variance_ratio_],
        "pc1_loadings": {
            col: round(float(w), 3)
            for col, w in zip(
                ["session_count", "feature_adoption_count", "support_tickets", "tenure_months"],
                pca.components_[0],
            )
        },
        "corr_pc1_vs_churn": round(corr_pc1_churn, 3),
        "corr_feature_adoption_vs_churn": round(corr_adoption_churn, 3),
        "corr_support_tickets_vs_churn": round(corr_tickets_churn, 3),
        "corr_sessions_vs_churn": round(corr_sessions_churn, 3),
        "churn_rate": round(float(df.churned.mean()), 3),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
