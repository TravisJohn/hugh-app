"""
Case Lab — Case #1: "Did the Q3 win-back email lift retention?"
Archetype: confounding / selection bias.

Data-generating process. The campaign was targeted preferentially at users who
were ALREADY engaged (selection bias), and retention is driven mostly by that
pre-existing engagement. The TRUE causal effect of the campaign is small, so a
naive campaigned-vs-not comparison massively overstates it.

Run:  python scripts/case-lab-src/campaign-retention/dgp.py
Emits: public/case-lab/campaign-retention/data.csv  (12,000 rows)
Prints: the naive vs confounder-adjusted retention effect + 10 sample rows,
        so the exact numbers can be baked into the teaching note.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "campaign-retention", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    # Pre-campaign engagement score (0-100) — THE CONFOUNDER.
    engagement = np.clip(rng.beta(2.2, 2.8, N) * 100.0, 0, 100).round(1)

    plan_tier = rng.choice(["basic", "plus", "premium"], N, p=[0.55, 0.30, 0.15])
    region = rng.choice(["NA", "EU", "APAC"], N, p=[0.50, 0.30, 0.20])

    # Signup month over the trailing 12 months (realistic tenure spread).
    months = pd.date_range("2025-07-01", periods=12, freq="MS").strftime("%Y-%m")
    signup_month = rng.choice(months, N)

    # TREATMENT: the win-back email was sent preferentially to engaged users.
    z = -0.40 + 0.90 * ((engagement - 50) / 12.0)
    got_campaign = rng.binomial(1, sigmoid(z))

    # OUTCOME: retention is driven strongly by engagement; the campaign's TRUE
    # effect is small (tau on the log-odds ≈ a couple of points of retention).
    tau = 0.15
    w = -0.60 + 0.85 * ((engagement - 50) / 12.0) + tau * got_campaign
    w += np.where(plan_tier == "premium", 0.25, np.where(plan_tier == "plus", 0.10, 0.0))
    retained_90d = rng.binomial(1, sigmoid(w))

    return pd.DataFrame(
        {
            "user_id": np.arange(1, N + 1),
            "signup_month": signup_month,
            "plan_tier": plan_tier,
            "region": region,
            "engagement_score": engagement,
            "got_campaign": got_campaign,
            "retained_90d": retained_90d,
        }
    )


def naive_effect(df: pd.DataFrame) -> float:
    a = df.loc[df.got_campaign == 1, "retained_90d"].mean()
    b = df.loc[df.got_campaign == 0, "retained_90d"].mean()
    return a - b


def adjusted_effect(df: pd.DataFrame, bins: int = 10) -> float:
    """Stratify on the confounder (engagement deciles), take the within-stratum
    campaign effect, and standardize over the whole population. Dependency-free
    stand-in for a regression/matching estimate — any valid method lands here."""
    df = df.copy()
    df["stratum"] = pd.qcut(df.engagement_score, bins, labels=False, duplicates="drop")
    diffs, weights = [], []
    for _, g in df.groupby("stratum"):
        t = g.loc[g.got_campaign == 1, "retained_90d"]
        c = g.loc[g.got_campaign == 0, "retained_90d"]
        if len(t) and len(c):
            diffs.append(t.mean() - c.mean())
            weights.append(len(g))
    return float(np.average(diffs, weights=weights))


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    stats = {
        "rows": len(df),
        "share_campaigned": round(df.got_campaign.mean(), 3),
        "overall_retention": round(df.retained_90d.mean(), 3),
        "naive_effect_pts": round(naive_effect(df) * 100, 1),
        "adjusted_effect_pts": round(adjusted_effect(df) * 100, 1),
        "mean_engagement_campaigned": round(df.loc[df.got_campaign == 1, "engagement_score"].mean(), 1),
        "mean_engagement_not": round(df.loc[df.got_campaign == 0, "engagement_score"].mean(), 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
