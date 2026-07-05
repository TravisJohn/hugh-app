"""
Case Lab — Case #2: "Users who contact support churn more — cut support."
Archetype: confounding (reverse-causality flavour).

Support contact is a MARKER of an account already in trouble (low health), not a
cause of churn. Low health drives both contacting support and churning, so the
naive comparison makes support look harmful. Adjusted for health, the true effect
is slightly PROTECTIVE — cutting support is exactly the wrong move.

Emits: public/case-lab/support-churn/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 7
N = 12_000
OUT = os.path.join("public", "case-lab", "support-churn", "data.csv")


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate():
    rng = np.random.default_rng(SEED)
    health = np.clip(rng.beta(2.5, 2.2, N) * 100, 0, 100).round(1)  # confounder
    industry = rng.choice(["SaaS", "Retail", "Finance", "Health", "Media"], N)
    seats = rng.integers(3, 400, N)
    tenure_months = rng.integers(1, 48, N)

    # Contact support when the account is struggling (low health).
    contacted = rng.binomial(1, sigmoid(0.2 - 0.9 * ((health - 50) / 12)))
    # Churn driven by low health; support is SLIGHTLY protective (true tau < 0).
    tau = -0.35
    churned = rng.binomial(1, sigmoid(0.1 - 0.95 * ((health - 50) / 12) + tau * contacted))

    return pd.DataFrame(
        {
            "account_id": np.arange(1, N + 1),
            "industry": industry,
            "seats": seats,
            "tenure_months": tenure_months,
            "health_score": health,
            "contacted_support": contacted,
            "churned": churned,
        }
    )


def naive(df):
    return df.loc[df.contacted_support == 1, "churned"].mean() - df.loc[df.contacted_support == 0, "churned"].mean()


def adjusted(df, bins=10):
    df = df.copy()
    df["s"] = pd.qcut(df.health_score, bins, labels=False, duplicates="drop")
    diffs, w = [], []
    for _, g in df.groupby("s"):
        t = g.loc[g.contacted_support == 1, "churned"]
        c = g.loc[g.contacted_support == 0, "churned"]
        if len(t) and len(c):
            diffs.append(t.mean() - c.mean())
            w.append(len(g))
    return float(np.average(diffs, weights=w))


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)
    stats = {
        "rows": len(df),
        "naive_pts": round(naive(df) * 100, 1),
        "adjusted_pts": round(adjusted(df) * 100, 1),
        "mean_health_contacted": round(df.loc[df.contacted_support == 1, "health_score"].mean(), 1),
        "mean_health_not": round(df.loc[df.contacted_support == 0, "health_score"].mean(), 1),
        "share_contacted": round(df.contacted_support.mean(), 3),
        "overall_churn": round(df.churned.mean(), 3),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
