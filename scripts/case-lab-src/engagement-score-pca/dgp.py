"""
Case Lab — "PC1 explains almost all the variance in our engagement matrix —
score users on it?"
Archetype: explained variance != business relevance.

Data-generating process. Four engagement metrics: page_views (0-5,000, huge
scale), purchase_count (0-10), email_opens (0-20), days_since_signup (1-365).
page_views' raw variance dwarfs the other three, so on unscaled features PC1
is almost entirely page_views. But 90-day retention is actually driven by
purchase_count (protective) and, weakly, email_opens — page_views barely
matters. PC1 "explains" nearly all the variance yet barely correlates with
the thing marketing actually wants to predict.

Run:  python scripts/case-lab-src/engagement-score-pca/dgp.py
Emits: public/case-lab/engagement-score-pca/data.csv  (12,000 rows)
Prints: PC1's variance share vs its correlation with retention, next to a raw
        feature's correlation with retention.
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA

SEED = 19
N = 12_000
OUT = os.path.join("public", "case-lab", "engagement-score-pca", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    days_since_signup = rng.integers(1, 366, N)
    purchase_count = np.clip(rng.poisson(2, N), 0, 10)
    email_opens = np.clip(rng.poisson(6, N), 0, 20)
    # page_views: big scale, weakly-to-not related to retention.
    page_views = np.clip(rng.lognormal(6.2, 1.1, N), 5, 6000).round(0)

    z = (
        -1.1
        + 0.65 * (purchase_count - 2)
        + 0.05 * (email_opens - 6)
        - 0.003 * (days_since_signup - 180)
    )
    retained_90d = rng.binomial(1, sigmoid(z))

    df = pd.DataFrame(
        {
            "user_id": np.arange(1, N + 1),
            "days_since_signup": days_since_signup,
            "page_views": page_views,
            "purchase_count": purchase_count,
            "email_opens": email_opens,
            "retained_90d": retained_90d,
        }
    )
    return df


def main() -> None:
    df = generate()

    features = df[["page_views", "purchase_count", "email_opens", "days_since_signup"]].to_numpy()
    pca = PCA(n_components=4, random_state=SEED)
    scores = pca.fit_transform(features)
    df["pc1_score"] = scores[:, 0].round(2)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    stats = {
        "rows": len(df),
        "explained_variance_ratio": [round(float(v), 3) for v in pca.explained_variance_ratio_],
        "pc1_loadings": {
            col: round(float(w), 3)
            for col, w in zip(
                ["page_views", "purchase_count", "email_opens", "days_since_signup"],
                pca.components_[0],
            )
        },
        "corr_pc1_vs_retained": round(float(np.corrcoef(df.pc1_score, df.retained_90d)[0, 1]), 3),
        "corr_purchase_vs_retained": round(float(np.corrcoef(df.purchase_count, df.retained_90d)[0, 1]), 3),
        "corr_email_opens_vs_retained": round(float(np.corrcoef(df.email_opens, df.retained_90d)[0, 1]), 3),
        "corr_pageviews_vs_retained": round(float(np.corrcoef(df.page_views, df.retained_90d)[0, 1]), 3),
        "retention_rate": round(float(df.retained_90d.mean()), 3),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
