"""
Case Lab — Case #3: "The new checkout converts worse overall — roll it back."
Archetype: Simpson's paradox.

The new checkout was rolled out mostly to MOBILE (which converts lower overall),
while the old checkout skews to DESKTOP. Within EACH device the new checkout
converts BETTER — but the device mix flips the aggregate, so overall the new one
looks worse. Rolling it back would be a mistake.

Emits: public/case-lab/checkout-redesign/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 11
N = 12_000
OUT = os.path.join("public", "case-lab", "checkout-redesign", "data.csv")
BASE = {"desktop": 0.20, "mobile": 0.08}
LIFT = 0.03  # the new checkout genuinely lifts conversion within each device


def generate():
    rng = np.random.default_rng(SEED)
    variant = rng.choice(["old", "new"], N)
    # Imbalance: new was rolled out to mobile first; old skews desktop.
    p_mobile = np.where(variant == "new", 0.70, 0.30)
    device = np.where(rng.random(N) < p_mobile, "mobile", "desktop")
    source = rng.choice(["organic", "paid", "email", "referral"], N)

    base = np.array([BASE[d] for d in device])
    p_conv = base + LIFT * (variant == "new")
    converted = rng.binomial(1, np.clip(p_conv, 0, 1))

    return pd.DataFrame(
        {
            "session_id": np.arange(1, N + 1),
            "device": device,
            "traffic_source": source,
            "variant": variant,
            "converted": converted,
        }
    )


def naive(df):
    return df.loc[df.variant == "new", "converted"].mean() - df.loc[df.variant == "old", "converted"].mean()


def within(df, device):
    d = df[df.device == device]
    return d.loc[d.variant == "new", "converted"].mean() - d.loc[d.variant == "old", "converted"].mean()


def standardized(df):
    """Device-mix-adjusted effect: within-device diffs weighted by overall device mix."""
    diffs, w = [], []
    for dev, g in df.groupby("device"):
        diffs.append(within(df, dev))
        w.append(len(g))
    return float(np.average(diffs, weights=w))


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)
    stats = {
        "rows": len(df),
        "naive_pts": round(naive(df) * 100, 1),
        "within_desktop_pts": round(within(df, "desktop") * 100, 1),
        "within_mobile_pts": round(within(df, "mobile") * 100, 1),
        "standardized_pts": round(standardized(df) * 100, 1),
        "new_mobile_share": round((df.loc[df.variant == "new", "device"] == "mobile").mean(), 2),
        "old_mobile_share": round((df.loc[df.variant == "old", "device"] == "mobile").mean(), 2),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
