"""
Case Lab — "Weekly sessions rose after the redesign — did engagement go up?"
Archetype: Simpson's paradox (a user-mix shift reverses the aggregate).

Data-generating process. The app shipped a redesign; overall weekly sessions per
user rose. But the launch was paired with a win-back campaign that pulled back a
wave of RETURNING users (who are far more active than new users). That mix shift
lifts the blended average even though WITHIN both segments — new and returning —
sessions per user fell. The redesign slightly hurt engagement; the headline hides
it behind the changed audience.

Run:  python scripts/case-lab-src/redesign-dau/dgp.py
Emits: public/case-lab/redesign-dau/data.csv  (12,000 rows)
Prints: overall sessions before/after AND per-segment sessions before/after.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "redesign-dau", "data.csv")

# Baseline weekly sessions (Poisson mean) by segment, BEFORE the redesign.
BASE = {"new": 3.0, "returning": 8.0}
# The redesign's real effect: EVERY segment loses ~0.6 sessions after.
DROP = 0.6
# Segment mix by period — the win-back push raises the returning share after.
MIX_BEFORE = {"new": 0.62, "returning": 0.38}
MIX_AFTER = {"new": 0.38, "returning": 0.62}


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    period = rng.choice(["before", "after"], N)
    segment = np.empty(N, dtype=object)
    for p, mix in (("before", MIX_BEFORE), ("after", MIX_AFTER)):
        m = period == p
        segment[m] = rng.choice(["new", "returning"], m.sum(), p=[mix["new"], mix["returning"]])

    platform = rng.choice(["ios", "android", "web"], N, p=[0.45, 0.35, 0.20])

    lam = np.array([BASE[s] for s in segment]) - np.where(period == "after", DROP, 0.0)
    sessions_7d = rng.poisson(np.clip(lam, 0.1, None))

    return pd.DataFrame(
        {
            "user_id": np.arange(1, N + 1),
            "user_segment": segment,
            "platform": platform,
            "period": period,
            "sessions_7d": sessions_7d,
        }
    )


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    overall = df.groupby("period").sessions_7d.mean().round(2).to_dict()
    per_seg = {}
    for s in ("new", "returning"):
        sub = df[df.user_segment == s].groupby("period").sessions_7d.mean().round(2)
        per_seg[s] = sub.to_dict()
    returning_share = df.groupby("period").apply(
        lambda g: round((g.user_segment == "returning").mean(), 3), include_groups=False
    ).to_dict()

    stats = {
        "rows": len(df),
        "overall_sessions": overall,
        "per_segment_sessions": per_seg,
        "returning_share": returning_share,
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
