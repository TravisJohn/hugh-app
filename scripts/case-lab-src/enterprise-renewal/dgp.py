"""
Case Lab — "Enterprise accounts renew at 94% — is enterprise our safest segment?"
Archetype: survivorship bias (conditioning on the survivors).

Data-generating process. Looking at the CURRENT active book, enterprise accounts
are long-tenured and renew at ~94% a year — they look like the stickiest segment.
But that view only contains the accounts that survived. Enterprise deals have the
HIGHEST first-year churn (big, complex, high expectations); the ones that fail are
gone from the active base. Count the full signup cohort — churned accounts included
— and enterprise has the WORST retention to two years. Survivors are sticky; the
segment is not safe.

Run:  python scripts/case-lab-src/enterprise-renewal/dgp.py
Emits: public/case-lab/enterprise-renewal/data.csv  (12,000 rows)
Prints: active-base renewal (survivor view) vs full-cohort survival by segment.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "enterprise-renewal", "data.csv")

SEGMENTS = ["smb", "mid", "enterprise"]
SEG_P = [0.55, 0.30, 0.15]
# First-year churn probability — HIGHEST for enterprise.
P_Y1_CHURN = {"smb": 0.16, "mid": 0.22, "enterprise": 0.34}
# Annual churn AFTER surviving year 1 — LOWEST for enterprise (survivors are sticky).
P_ANNUAL_CHURN = {"smb": 0.12, "mid": 0.09, "enterprise": 0.06}
# ACV (annual contract value) scale by segment.
ACV_MU = {"smb": 8.2, "mid": 10.0, "enterprise": 11.7}  # lognormal mean (log $)


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    segment = rng.choice(SEGMENTS, N, p=SEG_P)
    signup_year = rng.integers(2018, 2026, N)  # 2018..2025
    age_months = (2026 - signup_year) * 12  # months of possible tenure by 2026

    acv = np.array([round(float(rng.lognormal(ACV_MU[s], 0.5)), 0) for s in segment])

    tenure_months = np.empty(N, dtype=int)
    status = np.empty(N, dtype=object)

    for i in range(N):
        seg = segment[i]
        age = int(age_months[i])
        churn_month = None
        # Year 1 churn.
        if rng.random() < P_Y1_CHURN[seg]:
            churn_month = int(rng.integers(1, 13))
        else:
            # Subsequent years, only up to how old the account could be.
            years_possible = max(1, age // 12)
            for y in range(2, years_possible + 1):
                if rng.random() < P_ANNUAL_CHURN[seg]:
                    lo, hi = (y - 1) * 12 + 1, y * 12
                    churn_month = int(rng.integers(lo, hi + 1))
                    break
        if churn_month is not None and churn_month <= age:
            tenure_months[i] = churn_month
            status[i] = "churned"
        else:
            tenure_months[i] = max(1, age)
            status[i] = "active"

    return pd.DataFrame(
        {
            "account_id": np.arange(1, N + 1),
            "segment": segment,
            "signup_year": signup_year,
            "acv": acv,
            "tenure_months": tenure_months,
            "status": status,
        }
    )


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    # SURVIVOR VIEW: among accounts that REACHED their first renewal (tenure >= 12
    # months), the share still active — the "our accounts are loyal" number the
    # stakeholder quotes. Conditioning on reaching 12 months = keeping survivors.
    reached = df[df.tenure_months >= 12].copy()
    survivor_retention = (
        reached.assign(a=reached.status == "active").groupby("segment").a.mean().mul(100).round(1).to_dict()
    )
    # FULL-COHORT view: accounts old enough to have faced year 1 (age >= 12 mo).
    cohort = df[(2026 - df.signup_year) * 12 >= 12].copy()
    first_year_churn = (
        cohort.assign(fy=(cohort.status == "churned") & (cohort.tenure_months < 12))
        .groupby("segment").fy.mean().mul(100).round(1).to_dict()
    )
    # Survival to 24 months across cohorts old enough (age >= 24 mo).
    cohort24 = df[(2026 - df.signup_year) * 12 >= 24].copy()
    survive_24 = (
        cohort24.assign(s=cohort24.tenure_months >= 24).groupby("segment").s.mean().mul(100).round(1).to_dict()
    )

    stats = {
        "rows": len(df),
        "survivor_retention_reached12_by_seg": survivor_retention,
        "first_year_churn_by_seg": first_year_churn,
        "survive_to_24mo_by_seg": survive_24,
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
