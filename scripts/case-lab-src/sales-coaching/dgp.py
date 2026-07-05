"""
Case Lab — Case #5: "We coached our worst reps and they improved — coaching works."
Archetype: regression to the mean.

Each rep has a stable skill plus quarter-to-quarter luck. The reps who looked
worst in Q1 were partly unlucky, so they bounce back in Q2 whether or not anyone
coaches them. The TRUE coaching effect is zero — but because coaching was aimed
at the low performers, the coached group shows a big Q1→Q2 gain that is pure
regression to the mean. Equally-low reps who weren't coached improve just as much.

Emits: public/case-lab/sales-coaching/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 31
N = 12_000
OUT = os.path.join("public", "case-lab", "sales-coaching", "data.csv")
COACH_EFFECT = 0.0  # coaching does nothing here


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate():
    rng = np.random.default_rng(SEED)
    skill = rng.normal(50, 12, N)                          # stable ability
    q1 = skill + rng.normal(0, 10, N)                      # Q1 = skill + luck
    # Coaching aimed at low Q1 performers (not deterministic — some low reps miss out).
    coached = rng.binomial(1, sigmoid(-(q1 - 42) / 6))
    q2 = skill + rng.normal(0, 10, N) + COACH_EFFECT * coached

    return pd.DataFrame(
        {
            "rep_id": np.arange(1, N + 1),
            "region": rng.choice(["NA", "EMEA", "APAC", "LATAM"], N),
            "tenure_months": rng.integers(2, 60, N),
            "q1_sales_k": q1.round(1),
            "coached": coached,
            "q2_sales_k": q2.round(1),
        }
    )


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    df["change"] = df.q2_sales_k - df.q1_sales_k
    thr = df.q1_sales_k.quantile(0.20)  # "the worst reps" = bottom quintile in Q1
    low = df[df.q1_sales_k <= thr]
    stats = {
        "rows": len(df),
        "share_coached": round(df.coached.mean(), 3),
        "change_coached": round(df.loc[df.coached == 1, "change"].mean(), 1),
        "change_uncoached": round(df.loc[df.coached == 0, "change"].mean(), 1),
        "bottom_quintile_threshold": round(thr, 1),
        "lowq1_change_coached": round(low.loc[low.coached == 1, "change"].mean(), 1),
        "lowq1_change_uncoached": round(low.loc[low.coached == 0, "change"].mean(), 1),
        "corr_q1_q2": round(df.q1_sales_k.corr(df.q2_sales_k), 2),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.drop(columns="change").head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
