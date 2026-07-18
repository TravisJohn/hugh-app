"""
Case Lab — "K-means found 4 shopper personas — build campaigns around them?"
Archetype: feature-scaling dominance in clustering.

Data-generating process. There IS a real 2-group behavioral split (browsers vs
planners: how often someone visits and how deep each session goes). But
total_spend lives on a much bigger numeric scale ($20-5,000) than the behavioral
features (visits/session depth, both under 30). Run k-means on the raw, unscaled
columns and Euclidean distance is dominated by spend — the "4 personas" the
naive analysis finds are really just spend quartiles wearing a persona costume,
almost unrelated to the real behavioral split. Standardize first and the
honest clustering recovers something close to the true 2-group behavioral
segment instead, and barely tracks spend at all.

Run:  python scripts/case-lab-src/spend-scaled-personas/dgp.py
Emits: public/case-lab/spend-scaled-personas/data.csv  (12,000 rows)
Prints: naive (unscaled) vs honest (standardized) cluster agreement with spend
        quartile and with the true behavioral segment.
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "spend-scaled-personas", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    # The real behavioral split — planners visit less often but go deep each time;
    # browsers visit often but skim. Roughly balanced.
    true_segment = rng.binomial(1, 0.5, N)  # 0 = browser, 1 = planner
    segment_label = np.where(true_segment == 1, "planner", "browser")

    visit_frequency = np.clip(
        rng.normal(np.where(true_segment == 1, 6, 14), 2.5, N), 1, 30
    ).round(1)
    session_depth = np.clip(
        rng.normal(np.where(true_segment == 1, 9, 3), 1.8, N), 1, 20
    ).round(1)

    # Total spend — a big-scale column, only weakly tied to the behavioral split
    # (planners skew a little higher on average, but the dollar spread swamps it).
    channel = rng.choice(["paid", "organic", "referral"], N, p=[0.4, 0.4, 0.2])
    spend_base = np.where(true_segment == 1, 4.9, 4.7)  # lognormal mean, log-scale
    total_spend = np.round(rng.lognormal(spend_base, 0.9, N), 2)
    total_spend = np.clip(total_spend, 15, 6000)

    df = pd.DataFrame(
        {
            "customer_id": np.arange(1, N + 1),
            "channel": channel,
            "visit_frequency": visit_frequency,
            "session_depth": session_depth,
            "total_spend": total_spend,
        }
    )
    df["_true_segment"] = segment_label  # kept out of the shipped CSV
    return df


def cluster(df: pd.DataFrame):
    features_raw = df[["visit_frequency", "session_depth", "total_spend"]].to_numpy()

    # NAIVE — raw, unscaled k-means (k=4, matching the stakeholder's "4 personas").
    naive_km = KMeans(n_clusters=4, n_init=10, random_state=SEED)
    naive_labels = naive_km.fit_predict(features_raw)

    # HONEST — standardize first, then pick k by silhouette over 2..5.
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
    spend_quartile = pd.qcut(df.total_spend, 4, labels=False, duplicates="drop")
    true_seg_code = (df["_true_segment"] == "planner").astype(int)

    naive_labels, honest_k, honest_labels = cluster(df)

    out = df.drop(columns=["_true_segment"]).copy()
    out["naive_cluster"] = naive_labels
    out["honest_cluster"] = honest_labels
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.to_csv(OUT, index=False)

    stats = {
        "rows": len(df),
        "honest_k": int(honest_k),
        "ari_naive_vs_spend_quartile": round(float(adjusted_rand_score(naive_labels, spend_quartile)), 3),
        "ari_naive_vs_true_segment": round(float(adjusted_rand_score(naive_labels, true_seg_code)), 3),
        "ari_honest_vs_spend_quartile": round(float(adjusted_rand_score(honest_labels, spend_quartile)), 3),
        "ari_honest_vs_true_segment": round(float(adjusted_rand_score(honest_labels, true_seg_code)), 3),
        "spend_std": round(float(df.total_spend.std()), 1),
        "visit_std": round(float(df.visit_frequency.std()), 1),
        "depth_std": round(float(df.session_depth.std()), 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + out.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
