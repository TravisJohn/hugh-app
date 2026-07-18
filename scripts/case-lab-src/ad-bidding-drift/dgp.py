"""
Case Lab — "The learned bidder beats the fixed rule by $5/auction — keep it
live?"
Archetype: non-stationarity (train-era advantage doesn't survive a regime
shift).

Data-generating process. Two periods: "pre" (before a new competitor entered
the auction) and "post" (after). In the pre period, the learned bidder has a
large, genuine advantage over the fixed bidding rule. Once the competitor
enters, auction dynamics shift — win prices rise, margins compress — and the
learned bidder's advantage evaporates because it was tuned to the pre-period
environment; the fixed rule, simpler and less overfit to the old dynamics,
holds up about as well. Pooling both periods together (with "pre" the
majority of the data) makes the learned bidder look like a clear, current
winner when its edge has actually disappeared.

Run:  python scripts/case-lab-src/ad-bidding-drift/dgp.py
Emits: public/case-lab/ad-bidding-drift/data.csv  (12,000 rows)
Prints: pooled reward gap vs. period-split reward gap.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 59
N = 12_000
OUT = os.path.join("public", "case-lab", "ad-bidding-drift", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    period = rng.choice(["pre", "post"], N, p=[0.65, 0.35])
    is_post = period == "post"
    arm = rng.choice(["learned_bidder", "fixed_rule"], N, p=[0.5, 0.5])
    is_learned = arm == "learned_bidder"

    # Pre-period: learned bidder has a large genuine edge.
    # Post-period (competitor entered): edge evaporates / slightly reverses.
    mean_profit = np.where(
        ~is_post,
        np.where(is_learned, 12.0, 7.0),
        np.where(is_learned, 4.0, 4.6),
    )
    profit_per_auction = np.clip(rng.normal(mean_profit, 4.0, N), -10, None).round(2)

    df = pd.DataFrame(
        {
            "auction_id": np.arange(1, N + 1),
            "period": period,
            "arm": arm,
            "profit_per_auction": profit_per_auction,
        }
    )
    return df


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    pooled_learned = float(df.loc[df.arm == "learned_bidder", "profit_per_auction"].mean())
    pooled_fixed = float(df.loc[df.arm == "fixed_rule", "profit_per_auction"].mean())

    pre = df[df.period == "pre"]
    post = df[df.period == "post"]
    pre_learned = float(pre.loc[pre.arm == "learned_bidder", "profit_per_auction"].mean())
    pre_fixed = float(pre.loc[pre.arm == "fixed_rule", "profit_per_auction"].mean())
    post_learned = float(post.loc[post.arm == "learned_bidder", "profit_per_auction"].mean())
    post_fixed = float(post.loc[post.arm == "fixed_rule", "profit_per_auction"].mean())

    stats = {
        "rows": len(df),
        "share_post_period": round(float(is_post_share(df)), 3),
        "pooled_gap": round(pooled_learned - pooled_fixed, 2),
        "pre_period_gap": round(pre_learned - pre_fixed, 2),
        "post_period_gap": round(post_learned - post_fixed, 2),
        "pooled_learned": round(pooled_learned, 2),
        "pooled_fixed": round(pooled_fixed, 2),
        "pre_learned": round(pre_learned, 2),
        "pre_fixed": round(pre_fixed, 2),
        "post_learned": round(post_learned, 2),
        "post_fixed": round(post_fixed, 2),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


def is_post_share(df: pd.DataFrame) -> float:
    return (df.period == "post").mean()


if __name__ == "__main__":
    main()
