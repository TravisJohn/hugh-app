"""
Case Lab — Case #9: "Revenue jumped after we launched the loyalty program in
November — the program works."
Archetype: seasonality confound.

November and December are seasonal peaks every year. Comparing the pre-launch
autumn months to the post-launch holiday months confounds the loyalty program
with the holiday spike. A year-over-year comparison (same season, before vs after
launch) isolates the program's real, much smaller lift.

Transaction-level data, 12,000 orders across 24 months (2024-01 .. 2025-12).
Loyalty launches 2025-11 and adds ~5% to order value. Volume grows ~8% YoY.

Emits: public/case-lab/loyalty-launch/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 83
N = 12_000
OUT = os.path.join("public", "case-lab", "loyalty-launch", "data.csv")
LAUNCH = pd.Timestamp("2025-11-01")
PROGRAM_LIFT = 0.05  # +5% to order value post-launch (the true effect)
# Seasonal multiplier by calendar month (Jan..Dec): holiday peak in Nov/Dec.
SEASON = np.array([0.9, 0.85, 0.95, 1.0, 1.05, 1.0, 0.95, 0.95, 1.0, 1.1, 1.5, 1.8])


def generate():
    rng = np.random.default_rng(SEED)
    months = pd.date_range("2024-01-01", "2025-12-01", freq="MS")
    # Order volume per month = seasonal weight × YoY growth.
    weights = np.array(
        [SEASON[m.month - 1] * (1.08 if m.year == 2025 else 1.0) for m in months]
    )
    weights = weights / weights.sum()
    idx = rng.choice(len(months), size=N, p=weights)

    order_date = []
    for m in idx:
        start = months[m]
        day = rng.integers(0, start.days_in_month)
        order_date.append(start + pd.Timedelta(days=int(day)))
    order_date = pd.to_datetime(order_date)

    # Order value ~ lognormal around ~$60, flat over time except the program lift.
    value = rng.lognormal(mean=np.log(58), sigma=0.4, size=N)
    value = value * np.where(order_date >= LAUNCH, 1 + PROGRAM_LIFT, 1.0)

    # Left in natural (mixed-date) order, like a raw export — the learner sorts.
    return pd.DataFrame(
        {
            "order_id": np.arange(1, N + 1),
            "order_date": order_date.strftime("%Y-%m-%d"),
            "customer_segment": rng.choice(["new", "returning", "vip"], N, p=[0.45, 0.45, 0.10]),
            "channel": rng.choice(["web", "app", "marketplace"], N),
            "order_value": value.round(2),
        }
    )


def rev(df, start, end):
    m = (df.order_date >= start) & (df.order_date <= end)
    return df.loc[m, "order_value"].sum()


def avg_val(df, start, end):
    m = (df.order_date >= start) & (df.order_date <= end)
    return df.loc[m, "order_value"].mean()


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)
    d = df.copy()
    d["order_date"] = pd.to_datetime(d["order_date"])
    naive = rev(d, "2025-11-01", "2025-12-31") / rev(d, "2025-09-01", "2025-10-31") - 1
    yoy_rev = rev(d, "2025-11-01", "2025-12-31") / rev(d, "2024-11-01", "2024-12-31") - 1
    yoy_val = avg_val(d, "2025-11-01", "2025-12-31") / avg_val(d, "2024-11-01", "2024-12-31") - 1
    stats = {
        "rows": len(df),
        "naive_prepost_rev_pct": round(naive * 100, 1),
        "yoy_novdec_rev_pct": round(yoy_rev * 100, 1),
        "yoy_novdec_avg_value_pct": round(yoy_val * 100, 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
