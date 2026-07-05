"""
Case Lab — Case #10: "Conversion rose right after the December site-speed deploy —
the deploy lifted sales."
Archetype: seasonality confound.

December shoppers convert far better than November shoppers every year (holiday
purchase intent). The deploy shipped straight into that seasonal peak, so a
Nov→Dec comparison credits the deploy with the holiday. A year-over-year Dec vs
Dec comparison isolates the deploy's real, tiny lift.

Session-level data, 12,000 sessions across 24 months (2024-01 .. 2025-12).
Deploy ships 2025-12-01 and adds ~0.5 pts to conversion.

Emits: public/case-lab/sitespeed-deploy/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 97
N = 40_000
OUT = os.path.join("public", "case-lab", "sitespeed-deploy", "data.csv")
DEPLOY = pd.Timestamp("2025-12-01")
DEPLOY_LIFT = 0.0  # the deploy had NO real effect — the Nov→Dec jump is all season
# Baseline conversion by calendar month (Jan..Dec): a strong holiday peak in Dec.
CONV = np.array([0.08, 0.08, 0.09, 0.09, 0.09, 0.08, 0.08, 0.09, 0.10, 0.11, 0.11, 0.20])


def generate():
    rng = np.random.default_rng(SEED)
    months = pd.date_range("2024-01-01", "2025-12-01", freq="MS")
    # Mild seasonal traffic (a bit heavier in the holidays), flat YoY volume.
    weights = np.array([CONV[m.month - 1] + 0.6 for m in months])
    weights = weights / weights.sum()
    idx = rng.choice(len(months), size=N, p=weights)

    session_date = []
    for m in idx:
        start = months[m]
        day = rng.integers(0, start.days_in_month)
        session_date.append(start + pd.Timedelta(days=int(day)))
    session_date = pd.to_datetime(session_date)

    base = np.array([CONV[d.month - 1] for d in session_date])
    p = base + DEPLOY_LIFT * (session_date >= DEPLOY)
    converted = rng.binomial(1, np.clip(p, 0, 1))

    # Left in natural (mixed-date) order, like a raw export — the learner sorts.
    return pd.DataFrame(
        {
            "session_id": np.arange(1, N + 1),
            "session_date": session_date.strftime("%Y-%m-%d"),
            "device": rng.choice(["desktop", "mobile", "tablet"], N, p=[0.45, 0.5, 0.05]),
            "traffic_source": rng.choice(["organic", "paid", "email", "social"], N),
            "converted": converted,
        }
    )


def conv(df, start, end):
    m = (df.session_date >= start) & (df.session_date <= end)
    return df.loc[m, "converted"].mean()


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)
    d = df.copy()
    d["session_date"] = pd.to_datetime(d["session_date"])
    naive = conv(d, "2025-12-01", "2025-12-31") - conv(d, "2025-11-01", "2025-11-30")
    yoy = conv(d, "2025-12-01", "2025-12-31") - conv(d, "2024-12-01", "2024-12-31")
    stats = {
        "rows": len(df),
        "conv_nov2025": round(conv(d, "2025-11-01", "2025-11-30") * 100, 1),
        "conv_dec2025": round(conv(d, "2025-12-01", "2025-12-31") * 100, 1),
        "naive_novdec_pts": round(naive * 100, 1),
        "conv_dec2024": round(conv(d, "2024-12-01", "2024-12-31") * 100, 1),
        "yoy_dec_pts": round(yoy * 100, 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
