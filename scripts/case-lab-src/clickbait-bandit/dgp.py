"""
Case Lab — "The CTR bandit lifted clicks 60% — ship it to all traffic?"
Archetype: reward hacking (optimized proxy metric vs. true downstream metric).

Data-generating process. A contextual bandit was trained to maximize clicks
and, as bandits optimizing a proxy metric tend to do, learned to surface more
sensational/clickbait-leaning content — high click-through, low follow-through.
Traffic is split randomly 50/50 between the old rule-based ranker and the CTR
bandit (a clean rollout, no selection-bias confound here — the point is proxy
vs. true metric, not who saw what). Clicks rise sharply under the bandit, but
purchase rate — the metric that actually matters — falls, because clicked
content converts far worse.

Run:  python scripts/case-lab-src/clickbait-bandit/dgp.py
Emits: public/case-lab/clickbait-bandit/data.csv  (12,000 rows)
Prints: CTR lift vs. purchase-rate change by arm.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 47
N = 12_000
OUT = os.path.join("public", "case-lab", "clickbait-bandit", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    arm = rng.choice(["legacy_rule", "ctr_bandit"], N, p=[0.5, 0.5])
    is_bandit = arm == "ctr_bandit"

    p_click = np.where(is_bandit, 0.35, 0.22)
    clicked = rng.binomial(1, p_click)

    # Conditional on a click, purchase-through is much worse for the bandit's
    # clickbait-leaning picks than the rule-based ranker's more relevant ones.
    p_purchase_given_click = np.where(is_bandit, 0.08, 0.20)
    purchased = np.where(clicked == 1, rng.binomial(1, p_purchase_given_click), 0)

    df = pd.DataFrame(
        {
            "impression_id": np.arange(1, N + 1),
            "arm": arm,
            "clicked": clicked,
            "purchased": purchased,
        }
    )
    return df


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    ctr_legacy = float(df.loc[df.arm == "legacy_rule", "clicked"].mean())
    ctr_bandit = float(df.loc[df.arm == "ctr_bandit", "clicked"].mean())
    purch_legacy = float(df.loc[df.arm == "legacy_rule", "purchased"].mean())
    purch_bandit = float(df.loc[df.arm == "ctr_bandit", "purchased"].mean())

    clicked_only = df[df.clicked == 1]
    purch_rate_given_click_legacy = float(clicked_only.loc[clicked_only.arm == "legacy_rule", "purchased"].mean())
    purch_rate_given_click_bandit = float(clicked_only.loc[clicked_only.arm == "ctr_bandit", "purchased"].mean())

    stats = {
        "rows": len(df),
        "ctr_legacy_rule": round(ctr_legacy, 4),
        "ctr_ctr_bandit": round(ctr_bandit, 4),
        "ctr_lift_pct": round((ctr_bandit / ctr_legacy - 1) * 100, 1),
        "purchase_rate_legacy_rule": round(purch_legacy, 4),
        "purchase_rate_ctr_bandit": round(purch_bandit, 4),
        "purchase_rate_change_pct": round((purch_bandit / purch_legacy - 1) * 100, 1),
        "purchase_given_click_legacy": round(purch_rate_given_click_legacy, 4),
        "purchase_given_click_bandit": round(purch_rate_given_click_bandit, 4),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
