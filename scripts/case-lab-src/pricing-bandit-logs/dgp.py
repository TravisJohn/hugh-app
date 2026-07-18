"""
Case Lab — "The discount-price arm shows higher revenue per session in the
logs — roll it out everywhere?"
Archetype: off-policy evaluation bias (logged bandit selection bias).

Data-generating process. A live pricing bandit's logging policy leaned toward
showing the aggressive-discount arm to high predicted-LTV customers (a
"protect our best customers with a deal" heuristic). Revenue per session is
driven mostly by customer_ltv_score, and the discount arm's TRUE effect is
actually slightly NEGATIVE once LTV is held constant (giving away margin on
sessions that would have converted anyway). The naive average revenue by arm
is confounded by who got shown which arm; inverse-propensity weighting
(using the logged propensity) recovers the true, small negative effect.

Run:  python scripts/case-lab-src/pricing-bandit-logs/dgp.py
Emits: public/case-lab/pricing-bandit-logs/data.csv  (12,000 rows)
Prints: naive revenue gap vs IPS-corrected revenue gap.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 43
N = 12_000
OUT = os.path.join("public", "case-lab", "pricing-bandit-logs", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    customer_ltv_score = np.clip(rng.normal(50, 20, N), 0, 100).round(1)
    ltv_z = (customer_ltv_score - 50) / 20

    # LOGGING policy: P(shown the discount arm) rises with predicted LTV
    # ("protect our best customers with a deal").
    p_discount = sigmoid(-0.3 + 0.9 * ltv_z)
    arm = np.where(rng.random(N) < p_discount, "aggressive_discount", "standard_price")
    propensity = np.where(arm == "aggressive_discount", p_discount, 1 - p_discount).round(4)

    # TRUE reward model: driven mostly by LTV, with a SMALL true NEGATIVE arm
    # effect (the discount gives away margin on sessions that convert anyway).
    true_arm_effect = -2.5
    revenue_per_session = np.clip(
        40 + 22 * ltv_z + true_arm_effect * (arm == "aggressive_discount") + rng.normal(0, 8, N),
        0, None,
    ).round(2)

    df = pd.DataFrame(
        {
            "session_id": np.arange(1, N + 1),
            "customer_ltv_score": customer_ltv_score,
            "arm": arm,
            "propensity": propensity,
            "revenue_per_session": revenue_per_session,
        }
    )
    return df


def hajek_ips(df: pd.DataFrame, arm_name: str) -> float:
    sub = df[df.arm == arm_name]
    w = 1.0 / sub.propensity
    return float((w * sub.revenue_per_session).sum() / w.sum())


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    naive_d = float(df.loc[df.arm == "aggressive_discount", "revenue_per_session"].mean())
    naive_s = float(df.loc[df.arm == "standard_price", "revenue_per_session"].mean())
    ips_d = hajek_ips(df, "aggressive_discount")
    ips_s = hajek_ips(df, "standard_price")

    stats = {
        "rows": len(df),
        "share_discount_arm": round(float((df.arm == "aggressive_discount").mean()), 3),
        "mean_ltv_standard": round(float(df.loc[df.arm == "standard_price", "customer_ltv_score"].mean()), 1),
        "mean_ltv_discount": round(float(df.loc[df.arm == "aggressive_discount", "customer_ltv_score"].mean()), 1),
        "naive_revenue_standard": round(naive_s, 2),
        "naive_revenue_discount": round(naive_d, 2),
        "naive_gap": round(naive_d - naive_s, 2),
        "ips_revenue_standard": round(ips_s, 2),
        "ips_revenue_discount": round(ips_d, 2),
        "ips_gap": round(ips_d - ips_s, 2),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
