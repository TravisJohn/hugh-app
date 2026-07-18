"""
Case Lab — "The routing bandit lifted first-touch resolution 42% — roll it out
support-wide?"
Archetype: reward hacking (optimized proxy metric vs. true downstream metric).

Data-generating process. A routing bandit was trained to maximize first-touch
resolution (closed on the first reply) and learned to route toward whatever
maximizes that proxy — including closing tickets that aren't actually fixed.
Traffic is split randomly 50/50 between the old router and the optimized
bandit. First-touch resolution rises sharply, but reopened_within_7d — the
metric that actually reflects whether the issue got fixed — rises even more,
because a lot of the bandit's "resolutions" don't stick.

Run:  python scripts/case-lab-src/one-touch-routing-bandit/dgp.py
Emits: public/case-lab/one-touch-routing-bandit/data.csv  (12,000 rows)
Prints: first-touch resolution lift vs. reopen-rate change by arm.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 53
N = 12_000
OUT = os.path.join("public", "case-lab", "one-touch-routing-bandit", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    arm = rng.choice(["legacy_router", "optimized_router"], N, p=[0.5, 0.5])
    is_optimized = arm == "optimized_router"

    p_resolved_first_touch = np.where(is_optimized, 0.78, 0.55)
    resolved_first_touch = rng.binomial(1, p_resolved_first_touch)

    # Among "resolved" tickets, a lot of the optimized router's closures don't
    # actually stick — the ticket comes back within a week.
    p_reopen_given_resolved = np.where(is_optimized, 0.28, 0.06)
    reopened_within_7d = np.where(
        resolved_first_touch == 1, rng.binomial(1, p_reopen_given_resolved), 0
    )

    df = pd.DataFrame(
        {
            "ticket_id": np.arange(1, N + 1),
            "arm": arm,
            "resolved_first_touch": resolved_first_touch,
            "reopened_within_7d": reopened_within_7d,
        }
    )
    return df


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    res_legacy = float(df.loc[df.arm == "legacy_router", "resolved_first_touch"].mean())
    res_opt = float(df.loc[df.arm == "optimized_router", "resolved_first_touch"].mean())
    reopen_legacy = float(df.loc[df.arm == "legacy_router", "reopened_within_7d"].mean())
    reopen_opt = float(df.loc[df.arm == "optimized_router", "reopened_within_7d"].mean())

    resolved_only = df[df.resolved_first_touch == 1]
    reopen_given_resolved_legacy = float(
        resolved_only.loc[resolved_only.arm == "legacy_router", "reopened_within_7d"].mean()
    )
    reopen_given_resolved_opt = float(
        resolved_only.loc[resolved_only.arm == "optimized_router", "reopened_within_7d"].mean()
    )

    stats = {
        "rows": len(df),
        "resolved_first_touch_legacy": round(res_legacy, 4),
        "resolved_first_touch_optimized": round(res_opt, 4),
        "resolution_lift_pct": round((res_opt / res_legacy - 1) * 100, 1),
        "reopen_rate_legacy": round(reopen_legacy, 4),
        "reopen_rate_optimized": round(reopen_opt, 4),
        "reopen_rate_change_pct": round((reopen_opt / reopen_legacy - 1) * 100, 1),
        "reopen_given_resolved_legacy": round(reopen_given_resolved_legacy, 4),
        "reopen_given_resolved_optimized": round(reopen_given_resolved_opt, 4),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
