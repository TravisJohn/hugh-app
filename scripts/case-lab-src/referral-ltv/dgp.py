"""
Case Lab — Case #8: "Customers who referred a friend have ~3x the lifetime value —
push referrals to grow LTV."
Archetype: survivorship / reverse causality.

Referring a friend happens LATE in the lifecycle and only for happy, long-tenured
customers. So referrers are self-selected survivors with high engagement — and LTV
is driven by that engagement and tenure, not by the act of referring. Among
comparable (equally engaged, equally tenured) customers, the referral gap in LTV
is small. You can't grow a new customer's LTV by pushing them to refer.

Emits: public/case-lab/referral-ltv/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 71
N = 12_000
OUT = os.path.join("public", "case-lab", "referral-ltv", "data.csv")
REFERRAL_EFFECT = 40.0  # small true $ effect of referring on LTV


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate():
    rng = np.random.default_rng(SEED)
    engagement = np.clip(rng.beta(2.4, 2.6, N) * 100, 0, 100)
    tenure = np.clip(rng.poisson(2 + engagement / 4), 1, 48)

    # Referral is only possible after a while, and only engaged customers do it.
    can_refer = (tenure >= 6).astype(int)
    referred = rng.binomial(1, sigmoid(-2.6 + 0.05 * (engagement - 50))) * can_refer

    ltv = (
        30
        + 0.9 * engagement * tenure
        + REFERRAL_EFFECT * referred
        + rng.normal(0, 60, N)
    )
    ltv = np.clip(ltv, 0, None)

    return pd.DataFrame(
        {
            "customer_id": np.arange(1, N + 1),
            "segment": rng.choice(["consumer", "prosumer", "smb"], N, p=[0.6, 0.25, 0.15]),
            "signup_channel": rng.choice(["organic", "paid", "partner"], N),
            "engagement_score": engagement.round(1),
            "tenure_months": tenure,
            "referred_friend": referred,
            "ltv_usd": ltv.round(2),
        }
    )


def generate_stats(df):
    r = df[df.referred_friend == 1]
    n = df[df.referred_friend == 0]
    # Fair comparison: among customers who COULD refer (tenure>=6), match on
    # engagement deciles and take the size-weighted LTV gap.
    pool = df[df.tenure_months >= 6].copy()
    pool["e"] = pd.qcut(pool.engagement_score, 10, labels=False, duplicates="drop")
    pool["t"] = pd.qcut(pool.tenure_months, 5, labels=False, duplicates="drop")
    diffs, w = [], []
    for _, g in pool.groupby(["e", "t"]):
        a = g.loc[g.referred_friend == 1, "ltv_usd"]
        b = g.loc[g.referred_friend == 0, "ltv_usd"]
        if len(a) and len(b):
            diffs.append(a.mean() - b.mean())
            w.append(len(g))
    adj = float(np.average(diffs, weights=w))
    return {
        "rows": len(df),
        "share_referred": round(df.referred_friend.mean(), 3),
        "ltv_referred": round(r.ltv_usd.mean(), 0),
        "ltv_not": round(n.ltv_usd.mean(), 0),
        "naive_ratio": round(r.ltv_usd.mean() / n.ltv_usd.mean(), 2),
        "mean_tenure_referred": round(r.tenure_months.mean(), 1),
        "mean_tenure_not": round(n.tenure_months.mean(), 1),
        "mean_engagement_referred": round(r.engagement_score.mean(), 1),
        "mean_engagement_not": round(n.engagement_score.mean(), 1),
        "adjusted_ltv_gap_usd": round(adj, 0),
    }


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)
    print("STATS " + json.dumps(generate_stats(df)))
    print("SAMPLE " + df.head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
