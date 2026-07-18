"""
Case Lab — "The bandit's average reward beats the old creative — was it worth
running?"
Archetype: hidden exploration cost (regret the pooled average conceals).

Data-generating process. A creative bandit ran for 60 days against a fixed
old-creative baseline (a decent, previously-used ad, not the best possible
one). The bandit explores several creatives early — several of them worse
than the baseline — and only converges on a genuinely better creative partway
through. Pooled over the full 60 days, the bandit's average reward beats the
baseline. But split by week, the bandit actually LOSES to the baseline for
the first several weeks (the exploration cost), and a cumulative-regret view
against the eventual best-known creative shows real forgone reward during the
ramp that the single pooled average hides completely.

Run:  python scripts/case-lab-src/creative-bandit-regret/dgp.py
Emits: public/case-lab/creative-bandit-regret/data.csv  (12,000 rows)
Prints: pooled reward vs. week-by-week reward vs. cumulative regret.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 67
N_DAYS = 40
IMPRESSIONS_PER_DAY_PER_ARM = 150
OUT = os.path.join("public", "case-lab", "creative-bandit-regret", "data.csv")

BASELINE_PROB = 0.08
BANDIT_FLOOR = 0.045
BANDIT_CEILING = 0.15
RAMP_CENTER_DAY = 21
RAMP_STEEPNESS = 4.5


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def bandit_prob_for_day(day: int) -> float:
    s = sigmoid((day - RAMP_CENTER_DAY) / RAMP_STEEPNESS)
    return BANDIT_FLOOR + (BANDIT_CEILING - BANDIT_FLOOR) * s


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    rows = []
    for day in range(1, N_DAYS + 1):
        p_bandit = bandit_prob_for_day(day)
        bandit_rewards = rng.binomial(1, p_bandit, IMPRESSIONS_PER_DAY_PER_ARM)
        baseline_rewards = rng.binomial(1, BASELINE_PROB, IMPRESSIONS_PER_DAY_PER_ARM)
        for r in bandit_rewards:
            rows.append((day, "bandit", int(r)))
        for r in baseline_rewards:
            rows.append((day, "baseline", int(r)))

    df = pd.DataFrame(rows, columns=["day", "policy", "converted"])
    df.insert(0, "impression_id", np.arange(1, len(df) + 1))
    return df


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    pooled_bandit = float(df.loc[df.policy == "bandit", "converted"].mean())
    pooled_baseline = float(df.loc[df.policy == "baseline", "converted"].mean())

    daily = df.groupby(["day", "policy"]).converted.mean().unstack()
    daily["gap"] = daily["bandit"] - daily["baseline"]
    days_bandit_behind = int((daily["gap"] < 0).sum())
    week1_2 = daily.loc[1:14]
    week1_2_bandit = float(week1_2["bandit"].mean())
    week1_2_baseline = float(week1_2["baseline"].mean())

    # Cumulative regret vs the eventual best-known creative (BANDIT_CEILING),
    # per bandit impression-day, summed over the ramp.
    daily_regret_per_impression = BANDIT_CEILING - daily["bandit"]
    cumulative_regret_impressions = float(
        (daily_regret_per_impression.clip(lower=0) * IMPRESSIONS_PER_DAY_PER_ARM).sum()
    )

    stats = {
        "rows": len(df),
        "n_days": N_DAYS,
        "pooled_bandit_rate": round(pooled_bandit, 4),
        "pooled_baseline_rate": round(pooled_baseline, 4),
        "pooled_gap": round(pooled_bandit - pooled_baseline, 4),
        "days_bandit_below_baseline": days_bandit_behind,
        "first_2_weeks_bandit_rate": round(week1_2_bandit, 4),
        "first_2_weeks_baseline_rate": round(week1_2_baseline, 4),
        "first_2_weeks_gap": round(week1_2_bandit - week1_2_baseline, 4),
        "cumulative_regret_conversions_vs_best_known": round(cumulative_regret_impressions, 1),
        "day_gap_crosses_zero": int(daily[daily["gap"] >= 0].index.min()),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
