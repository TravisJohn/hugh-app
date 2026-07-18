"""
Case Lab — "The new checkout UI converts better overall — make it the
default?"
Archetype: bandit traffic-allocation Simpson's paradox.

Data-generating process. A contextual policy rolled the new checkout UI out
more aggressively on mobile than desktop (mobile got 75% new_ui / 25% old_ui;
desktop got the reverse). Mobile also converts substantially higher than
desktop for this checkout regardless of UI. WITHIN each device segment, the
old UI actually converts slightly better than the new one. But pooling both
segments, the new UI's traffic skews toward the higher-converting mobile
segment and the old UI's skews toward the lower-converting desktop segment —
so the pooled comparison shows the new UI "winning" even though it loses on
every single segment. Classic Simpson's paradox, driven by unequal arm
allocation rather than a random split.

Run:  python scripts/case-lab-src/checkout-bandit-simpson/dgp.py
Emits: public/case-lab/checkout-bandit-simpson/data.csv  (12,000 rows)
Prints: pooled conversion gap vs. per-segment conversion gap.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 73
N = 12_000
OUT = os.path.join("public", "case-lab", "checkout-bandit-simpson", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    device = rng.choice(["mobile", "desktop"], N, p=[0.6, 0.4])
    is_mobile = device == "mobile"

    # Policy allocates new_ui unevenly by device — mobile-first rollout.
    p_new_ui = np.where(is_mobile, 0.75, 0.25)
    arm = np.where(rng.random(N) < p_new_ui, "new_ui", "old_ui")
    is_new = arm == "new_ui"

    # Within each device segment, old_ui converts slightly better. Mobile
    # converts substantially higher than desktop regardless of UI.
    p_convert = np.select(
        [is_mobile & is_new, is_mobile & ~is_new, ~is_mobile & is_new, ~is_mobile & ~is_new],
        [0.130, 0.152, 0.070, 0.092],
    )
    converted = rng.binomial(1, p_convert)

    df = pd.DataFrame(
        {
            "session_id": np.arange(1, N + 1),
            "device": device,
            "arm": arm,
            "converted": converted,
        }
    )
    return df


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    pooled_new = float(df.loc[df.arm == "new_ui", "converted"].mean())
    pooled_old = float(df.loc[df.arm == "old_ui", "converted"].mean())

    by_device = {}
    for dev in ["mobile", "desktop"]:
        sub = df[df.device == dev]
        new_rate = float(sub.loc[sub.arm == "new_ui", "converted"].mean())
        old_rate = float(sub.loc[sub.arm == "old_ui", "converted"].mean())
        by_device[dev] = {"new_ui": round(new_rate, 4), "old_ui": round(old_rate, 4), "gap": round(new_rate - old_rate, 4)}

    stats = {
        "rows": len(df),
        "share_mobile": round(float(is_mobile_share(df)), 3),
        "pooled_new_ui": round(pooled_new, 4),
        "pooled_old_ui": round(pooled_old, 4),
        "pooled_gap": round(pooled_new - pooled_old, 4),
        "by_device": by_device,
        "new_ui_share_mobile": round(float(df.loc[df.device == "mobile", "arm"].eq("new_ui").mean()), 3),
        "new_ui_share_desktop": round(float(df.loc[df.device == "desktop", "arm"].eq("new_ui").mean()), 3),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


def is_mobile_share(df: pd.DataFrame) -> float:
    return (df.device == "mobile").mean()


if __name__ == "__main__":
    main()
