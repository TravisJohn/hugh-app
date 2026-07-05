"""
Case Lab — Case #7: "Users who run 50+ workflows almost never churn — push everyone
to 50 workflows."
Archetype: survivorship bias (outcome measured on a survivor-defined threshold).

Cumulative workflow count is a CONSEQUENCE of sticking around: only users who
stay active for months can accumulate 50+ workflows. Churned and brand-new users
mechanically can't. So "50+ workflows → low churn" is near-circular. A fair,
equally-available signal — activity in the FIRST month — barely predicts churn by
comparison. Pushing a new user's workflow counter does not manufacture the tenure.

Emits: public/case-lab/power-users/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 59
N = 12_000
OUT = os.path.join("public", "case-lab", "power-users", "data.csv")


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate():
    rng = np.random.default_rng(SEED)
    engagement = np.clip(rng.beta(2.3, 2.6, N) * 100, 0, 100)     # underlying propensity to stay + do work

    # Churn is driven by (low) engagement.
    churned = rng.binomial(1, sigmoid(0.3 - 0.9 * ((engagement - 50) / 12)))

    # Tenure in months: survivors accrue many months; churners leave early.
    lam = np.where(churned == 1, 1 + engagement / 40, 6 + engagement / 6)
    tenure_months = np.clip(rng.poisson(lam), 1, 36)

    # First-month workflows: available to EVERYONE, driven by engagement.
    workflows_first_month = rng.poisson(np.clip(0.12 * engagement, 0.2, None))

    # Total workflows: accrue with engagement AND months survived (the survivor trap).
    per_month = np.clip(0.10 * engagement, 0.2, None)
    workflows_total = rng.poisson(per_month * tenure_months) + workflows_first_month

    return pd.DataFrame(
        {
            "user_id": np.arange(1, N + 1),
            "plan": rng.choice(["free", "pro", "team"], N, p=[0.5, 0.35, 0.15]),
            "engagement_score": engagement.round(1),
            "workflows_first_month": workflows_first_month,
            "workflows_total": workflows_total,
            "tenure_months": tenure_months,
            "churned": churned,
        }
    )


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    hi = df[df.workflows_total >= 50]
    lo = df[df.workflows_total < 50]
    fm_med = df.workflows_first_month.median()
    fm_hi = df[df.workflows_first_month >= fm_med]
    fm_lo = df[df.workflows_first_month < fm_med]
    stats = {
        "rows": len(df),
        "overall_churn": round(df.churned.mean(), 3),
        "share_50plus_total": round((df.workflows_total >= 50).mean(), 3),
        "churn_50plus_total": round(hi.churned.mean(), 3),
        "churn_under50_total": round(lo.churned.mean(), 3),
        "naive_total_gap_pts": round((lo.churned.mean() - hi.churned.mean()) * 100, 1),
        "mean_tenure_50plus": round(hi.tenure_months.mean(), 1),
        "mean_tenure_under50": round(lo.tenure_months.mean(), 1),
        "churn_firstmonth_high": round(fm_hi.churned.mean(), 3),
        "churn_firstmonth_low": round(fm_lo.churned.mean(), 3),
        "firstmonth_gap_pts": round((fm_lo.churned.mean() - fm_hi.churned.mean()) * 100, 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
