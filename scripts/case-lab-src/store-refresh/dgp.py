"""
Case Lab — Case #6: "We remodeled our worst-rated stores and ratings rebounded."
Archetype: regression to the mean.

Each store has a stable underlying quality plus month-to-month rating noise. The
lowest-rated stores were partly just having a bad stretch, so their ratings climb
back toward their true level regardless of any remodel. The TRUE remodel effect is
zero — the rebound is regression to the mean. Equally-low stores that weren't
remodeled recover just as much.

Emits: public/case-lab/store-refresh/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 43
N = 12_000
OUT = os.path.join("public", "case-lab", "store-refresh", "data.csv")
REMODEL_EFFECT = 0.0


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate():
    rng = np.random.default_rng(SEED)
    quality = np.clip(rng.normal(72, 9, N), 0, 100)              # stable store quality
    rating_before = np.clip(quality + rng.normal(0, 8, N), 0, 100)
    # Remodel targeted the lowest-rated stores (noisy targeting).
    remodeled = rng.binomial(1, sigmoid(-(rating_before - 64) / 5))
    rating_after = np.clip(quality + rng.normal(0, 8, N) + REMODEL_EFFECT * remodeled, 0, 100)

    return pd.DataFrame(
        {
            "store_id": np.arange(1, N + 1),
            "region": rng.choice(["West", "South", "Midwest", "Northeast"], N),
            "footprint_sqft": rng.integers(1200, 9000, N),
            "rating_before": rating_before.round(1),
            "remodeled": remodeled,
            "rating_after": rating_after.round(1),
        }
    )


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    df["change"] = df.rating_after - df.rating_before
    thr = df.rating_before.quantile(0.20)
    low = df[df.rating_before <= thr]
    stats = {
        "rows": len(df),
        "share_remodeled": round(df.remodeled.mean(), 3),
        "change_remodeled": round(df.loc[df.remodeled == 1, "change"].mean(), 1),
        "change_not": round(df.loc[df.remodeled == 0, "change"].mean(), 1),
        "bottom_quintile_threshold": round(thr, 1),
        "lowbefore_change_remodeled": round(low.loc[low.remodeled == 1, "change"].mean(), 1),
        "lowbefore_change_not": round(low.loc[low.remodeled == 0, "change"].mean(), 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.drop(columns="change").head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
