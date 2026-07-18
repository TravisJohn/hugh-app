"""
Case Lab — "The RL router beats the heuristic by 9 points of on-time rate —
make it permanent?"
Archetype: non-stationarity (train-era advantage doesn't survive a regime
shift).

Data-generating process. Two periods: "normal" (most of the test window) and
"holiday_surge" (a short high-volume window). In the normal period, the RL
routing policy has a large, genuine on-time-in-full advantage over the
simpler capacity-aware heuristic. Once holiday-surge volume hits, warehouse
constraints bind in ways the RL policy wasn't trained on, and its advantage
evaporates — the heuristic, built around explicit capacity rules, degrades
less. Pooling both periods (with "normal" the majority) makes the RL router
look like a clear, current winner when its edge has actually disappeared
right when it matters most.

Run:  python scripts/case-lab-src/inventory-routing-drift/dgp.py
Emits: public/case-lab/inventory-routing-drift/data.csv  (12,000 rows)
Prints: pooled reward gap vs. period-split reward gap.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 61
N = 12_000
OUT = os.path.join("public", "case-lab", "inventory-routing-drift", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    period = rng.choice(["normal", "holiday_surge"], N, p=[0.7, 0.3])
    is_surge = period == "holiday_surge"
    arm = rng.choice(["rl_router", "heuristic_router"], N, p=[0.5, 0.5])
    is_rl = arm == "rl_router"

    # Normal period: RL router has a large genuine edge.
    # Holiday surge (regime shift): edge evaporates / slightly reverses.
    p_on_time = np.where(
        ~is_surge,
        np.where(is_rl, 0.93, 0.84),
        np.where(is_rl, 0.71, 0.75),
    )
    on_time_in_full = rng.binomial(1, p_on_time)

    df = pd.DataFrame(
        {
            "order_id": np.arange(1, N + 1),
            "period": period,
            "arm": arm,
            "on_time_in_full": on_time_in_full,
        }
    )
    return df


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    pooled_rl = float(df.loc[df.arm == "rl_router", "on_time_in_full"].mean())
    pooled_heur = float(df.loc[df.arm == "heuristic_router", "on_time_in_full"].mean())

    normal = df[df.period == "normal"]
    surge = df[df.period == "holiday_surge"]
    normal_rl = float(normal.loc[normal.arm == "rl_router", "on_time_in_full"].mean())
    normal_heur = float(normal.loc[normal.arm == "heuristic_router", "on_time_in_full"].mean())
    surge_rl = float(surge.loc[surge.arm == "rl_router", "on_time_in_full"].mean())
    surge_heur = float(surge.loc[surge.arm == "heuristic_router", "on_time_in_full"].mean())

    stats = {
        "rows": len(df),
        "share_holiday_surge": round(float((df.period == "holiday_surge").mean()), 3),
        "pooled_gap_pp": round((pooled_rl - pooled_heur) * 100, 1),
        "normal_gap_pp": round((normal_rl - normal_heur) * 100, 1),
        "surge_gap_pp": round((surge_rl - surge_heur) * 100, 1),
        "pooled_rl": round(pooled_rl * 100, 1),
        "pooled_heuristic": round(pooled_heur * 100, 1),
        "normal_rl": round(normal_rl * 100, 1),
        "normal_heuristic": round(normal_heur * 100, 1),
        "surge_rl": round(surge_rl * 100, 1),
        "surge_heuristic": round(surge_heur * 100, 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
