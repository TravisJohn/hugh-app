"""
Case Lab — "The new notification timing gets a higher open rate overall —
switch everyone to it?"
Archetype: bandit traffic-allocation paradox.

Data-generating process. A contextual policy rolled the new push-notification
timing out more aggressively to weekday-active users than weekend-only users
(weekday-active got new_timing 72% of the time; weekend-only got it only
28%). Weekday-active users also open push notifications at a substantially
higher baseline rate regardless of timing. WITHIN each cohort, the old timing
actually gets a higher open rate than the new one. But pooling both cohorts,
the new timing's traffic skews toward the higher-opening weekday-active
cohort and the old timing's skews toward the lower-opening weekend-only
cohort — so the pooled comparison shows the new timing "winning" even though
it loses in both cohorts. Simpson's paradox, driven by unequal allocation.

Run:  python scripts/case-lab-src/push-notification-bandit-simpson/dgp.py
Emits: public/case-lab/push-notification-bandit-simpson/data.csv  (12,000 rows)
Prints: pooled open-rate gap vs. per-cohort open-rate gap.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 79
N = 12_000
OUT = os.path.join("public", "case-lab", "push-notification-bandit-simpson", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    user_cohort = rng.choice(["weekday_active", "weekend_only"], N, p=[0.65, 0.35])
    is_weekday = user_cohort == "weekday_active"

    # Policy allocates new_timing unevenly by cohort — weekday-first rollout.
    p_new_timing = np.where(is_weekday, 0.72, 0.28)
    arm = np.where(rng.random(N) < p_new_timing, "new_timing", "old_timing")
    is_new = arm == "new_timing"

    # Within each cohort, old_timing gets a higher open rate. weekday_active
    # opens push notifications far more than weekend_only regardless of timing.
    p_open = np.select(
        [is_weekday & is_new, is_weekday & ~is_new, ~is_weekday & is_new, ~is_weekday & ~is_new],
        [0.335, 0.355, 0.155, 0.205],
    )
    opened = rng.binomial(1, p_open)

    df = pd.DataFrame(
        {
            "notification_id": np.arange(1, N + 1),
            "user_cohort": user_cohort,
            "arm": arm,
            "opened": opened,
        }
    )
    return df


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    pooled_new = float(df.loc[df.arm == "new_timing", "opened"].mean())
    pooled_old = float(df.loc[df.arm == "old_timing", "opened"].mean())

    by_cohort = {}
    for cohort in ["weekday_active", "weekend_only"]:
        sub = df[df.user_cohort == cohort]
        new_rate = float(sub.loc[sub.arm == "new_timing", "opened"].mean())
        old_rate = float(sub.loc[sub.arm == "old_timing", "opened"].mean())
        by_cohort[cohort] = {"new_timing": round(new_rate, 4), "old_timing": round(old_rate, 4), "gap": round(new_rate - old_rate, 4)}

    stats = {
        "rows": len(df),
        "share_weekday_active": round(float((df.user_cohort == "weekday_active").mean()), 3),
        "pooled_new_timing": round(pooled_new, 4),
        "pooled_old_timing": round(pooled_old, 4),
        "pooled_gap": round(pooled_new - pooled_old, 4),
        "by_cohort": by_cohort,
        "new_timing_share_weekday": round(float(df.loc[df.user_cohort == "weekday_active", "arm"].eq("new_timing").mean()), 3),
        "new_timing_share_weekend": round(float(df.loc[df.user_cohort == "weekend_only", "arm"].eq("new_timing").mean()), 3),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
